import os
import time
from playwright.sync_api import sync_playwright

def harvest_instagram_post(post_url, output_dir, progress_cb=None):
    """
    Harvests clean 4:5 post slides directly from any Instagram post URL.
    Bypasses login popups and navigates the carousel automatically.
    Returns list of captured slide image paths.
    """
    os.makedirs(output_dir, exist_ok=True)
    if progress_cb:
        progress_cb(f"Navigating to Instagram post: {post_url}", 10)
        
    harvested = []
    with sync_playwright() as p:
        try:
            # Try MS Edge first (ideal for Windows)
            browser = p.chromium.launch(channel="msedge", headless=True)
        except Exception:
            # Fallback to standard Chromium (for Docker / Linux / Cloud)
            browser = p.chromium.launch(headless=True)

        page = browser.new_page(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        try:
            page.goto(post_url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)
            
            # Remove any Instagram login / signup dialogs from DOM
            page.evaluate("""() => {
                document.querySelectorAll('div[role="dialog"]').forEach(el => el.remove());
                document.querySelectorAll('div[role="presentation"]').forEach(el => {
                    if (el.innerText && (el.innerText.includes('Sign up') || el.innerText.includes('Log in'))) {
                        el.remove();
                    }
                });
                document.body.style.overflow = 'auto';
            }""")
            time.sleep(1)
            
            # Locate 4:5 media container on desktop view (supports both image and video posts)
            box = page.evaluate("""() => {
                const candidates = Array.from(document.querySelectorAll('article img, article video, main img, main video'));
                for (let el of candidates) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 280 && rect.height > 280 && rect.x < 750 && rect.y < 250) {
                        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                    }
                }
                const art = document.querySelector('article');
                if (art) {
                    const r = art.getBoundingClientRect();
                    if (r.width > 300) {
                        const targetW = Math.min(r.width, 650);
                        return { x: r.x, y: r.y, width: targetW, height: Math.min(r.height, 800) };
                    }
                }
                return { x: 195, y: 92, width: 490, height: 608 };
            }""")
            
            slide_idx = 1
            max_slides = 10
            
            while slide_idx <= max_slides:
                if progress_cb:
                    progress_cb(f"Capturing reference slide {slide_idx}...", 10 + slide_idx * 3)
                    
                slide_path = os.path.join(output_dir, f"clean_slide_{slide_idx:02d}.png")
                page.screenshot(path=slide_path, clip=box)
                harvested.append(slide_path)
                
                # Click Next button via JS across multi-language interfaces
                has_next = page.evaluate("""() => {
                    const nextLabels = ['next', 'siguiente', 'suivant', 'weiter', 'avanti', 'próximo', 'следующ', 'следующее'];
                    const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
                    for (let b of btns) {
                        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                        if (nextLabels.some(l => aria.includes(l))) {
                            b.click();
                            return true;
                        }
                        const svg = b.querySelector('svg');
                        if (svg) {
                            const svgAria = (svg.getAttribute('aria-label') || '').toLowerCase();
                            if (nextLabels.some(l => svgAria.includes(l))) {
                                b.click();
                                return true;
                            }
                        }
                    }
                    return false;
                }""")
                
                if not has_next:
                    break
                    
                time.sleep(1.4)
                slide_idx += 1
                
        except Exception as e:
            print(f"[HARVESTER ERROR] {e}")
        finally:
            browser.close()
            
    return harvested
