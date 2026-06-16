import os
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Cache variables to avoid hammering the Google Cloud servers
cache = {
    "data": None,
    "last_fetched": None
}

def parse_release_notes():
    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        # Parse XML
        root = ET.fromstring(response.content)
        
        # Atom feed namespace
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        all_updates = []
        
        for entry in root.findall('atom:entry', ns):
            date = entry.find('atom:title', ns).text
            
            # Find alternate link
            link = ""
            for l in entry.findall('atom:link', ns):
                if l.attrib.get('rel') == 'alternate' or not l.attrib.get('rel'):
                    link = l.attrib.get('href', '')
                    break
                    
            content_elem = entry.find('atom:content', ns)
            if content_elem is None or not content_elem.text:
                continue
                
            html_content = content_elem.text
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Split by <h3> tags
            current_type = None
            current_nodes = []
            entry_updates = []
            
            # Helper to create and add update
            def add_update(update_type, nodes):
                if not update_type or not nodes:
                    return
                # Reconstruct HTML
                desc_html = ""
                desc_text = ""
                for n in nodes:
                    desc_html += str(n)
                    if hasattr(n, 'get_text'):
                        desc_text += n.get_text()
                    else:
                        desc_text += str(n)
                        
                desc_html = desc_html.strip()
                desc_text = desc_text.strip()
                
                # Make sure links in description open in new tab and are absolute
                desc_soup = BeautifulSoup(desc_html, 'html.parser')
                for a in desc_soup.find_all('a'):
                    a['target'] = '_blank'
                    a['rel'] = 'noopener noreferrer'
                    # If relative link, make it absolute (assuming GCP docs base)
                    href = a.get('href', '')
                    if href.startswith('/'):
                        a['href'] = f"https://cloud.google.com{href}"
                
                # Re-extract clean text for sharing
                share_text = desc_soup.get_text().strip()
                
                # Generate unique ID for this update card
                import hashlib
                unique_str = f"{date}-{update_type}-{desc_text[:50]}"
                update_id = hashlib.md5(unique_str.encode('utf-8')).hexdigest()
                
                entry_updates.append({
                    'id': update_id,
                    'date': date,
                    'link': link,
                    'type': update_type,
                    'description_html': str(desc_soup),
                    'description_text': share_text
                })

            for child in soup.contents:
                if child.name == 'h3':
                    # Save previous update if any
                    add_update(current_type, current_nodes)
                    current_type = child.get_text().strip()
                    current_nodes = []
                else:
                    if current_type is not None:
                        current_nodes.append(child)
                    else:
                        # Sometimes there is text before any <h3>
                        # Treat it as general update type
                        current_type = "Update"
                        current_nodes.append(child)
            
            # Add the final update in this entry
            add_update(current_type, current_nodes)
            
            # If no structured updates were added, add the whole body
            if not entry_updates:
                desc_html = str(soup).strip()
                desc_text = soup.get_text().strip()
                
                import hashlib
                unique_str = f"{date}-Update-{desc_text[:50]}"
                update_id = hashlib.md5(unique_str.encode('utf-8')).hexdigest()
                
                entry_updates.append({
                    'id': update_id,
                    'date': date,
                    'link': link,
                    'type': 'Update',
                    'description_html': desc_html,
                    'description_text': desc_text
                })
                
            all_updates.extend(entry_updates)
            
        return {
            "success": True,
            "updates": all_updates
        }
        
    except Exception as e:
        print(f"Error fetching or parsing feed: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "updates": []
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/updates')
def get_updates():
    # Force refresh if query param is set
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    
    if force_refresh or cache["data"] is None:
        data = parse_release_notes()
        if data["success"]:
            cache["data"] = data["updates"]
            import datetime
            cache["last_fetched"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            return jsonify({
                "success": True,
                "updates": cache["data"],
                "last_fetched": cache["last_fetched"]
            })
        else:
            # If fetch fails but we have cached data, return cached data with an error warning
            if cache["data"] is not None:
                return jsonify({
                    "success": True,
                    "updates": cache["data"],
                    "last_fetched": cache["last_fetched"],
                    "warning": "Failed to fetch fresh data. Showing cached version: " + data["error"]
                })
            return jsonify({
                "success": False,
                "error": data["error"]
            }), 500
            
    return jsonify({
        "success": True,
        "updates": cache["data"],
        "last_fetched": cache["last_fetched"]
    })

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
