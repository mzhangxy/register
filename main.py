#!/usr/bin/env python3

import os
import re
import sys
import time
import requests
from datetime import datetime
from DrissionPage import ChromiumPage, ChromiumOptions

EMAIL = os.environ.get("EMAIL") or ""
PASSWORD = os.environ.get("PASSWORD") or ""
TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID", "")

LOGIN_URL = "https://auth.aida0710.work/login"
DASH_URL = "https://hosting.aida0710.work/dashboard"

if not EMAIL or not PASSWORD:
    print("❌ 请设置环境变量 EMAIL 和 PASSWORD")
    sys.exit(1)

def send_tg(token, chat_id, message, image_path=None):
    if not token or not chat_id:
        return
    message = f"🇯🇵  Aida续期通知\n\n{message}"
    try:
        if image_path and os.path.exists(image_path):
            url = f"https://api.telegram.org/bot{token}/sendPhoto"
            with open(image_path, 'rb') as f:
                payload = {"chat_id": chat_id, "caption": message}
                files = {"photo": f}
                resp = requests.post(url, data=payload, files=files, timeout=20)
        else:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            resp = requests.post(url, json={"chat_id": chat_id, "text": message}, timeout=10)
            
        if resp.status_code == 200:
            print("📨 Telegram 通知已发送")
        else:
            print(f"❌ Telegram 发送失败: {resp.text}")
    except Exception as e:
        print(f"❌ Telegram 发送异常: {e}")

def mask_email(email):
    if '@' not in email:
        return email
    local, domain = email.split('@', 1)
    if len(local) <= 4:
        masked_local = local[0] + '****' + local[-1] if len(local) > 1 else local
    else:
        masked_local = local[:1] + '****' + local[-2:]
    return f"{masked_local}@{domain}"

def solve_turnstile(page):
    """DrissionPage 专用过盾逻辑 (参考实战代码)"""
    print("🛡️ [Turnstile] 尝试处理 Turnstile 挑战...")
    
    try:
        # 1. 检测是否已经有 token（直通情况）
        token_ele = page.ele('css:[name="cf-turnstile-response"]', timeout=2)
        if token_ele and token_ele.value:
            print("⚡ [Auto-Pass] Token already exists!")
            return True

        print("🔍 等待 Turnstile Iframe 加载 (最大20秒)...")
        iframe_ele = page.ele('css:iframe[src*="challenges"]', timeout=20)
        
        if not iframe_ele:
            print("⚠️ 未找到 Turnstile Iframe，可能不需要验证")
            return False
            
        print("✅ 找到 Iframe")
        iframe = page.get_frame(iframe_ele)
        time.sleep(1)

        click_success = False
        try:
            body = iframe.ele('tag:body')
            if body:
                sr = body.shadow_root
                if sr:
                    print("🔓 成功进入 ShadowRoot")
                    cb = sr.ele('css:input[type="checkbox"]') or sr.ele('css:div.main-wrapper')
                    if cb:
                        print("🖱️ [Pierce] 找到 Checkbox，尝试点击!")
                        cb.click()
                        click_success = True
                    else:
                        print("⚠️ ShadowRoot 内未找到复选框")
                else:
                    print("⚠️ 未检测到 ShadowRoot")
        except Exception as e:
            print(f"⚠️ ShadowRoot 穿透异常: {e}")

        # 备用：如果上面的穿透点击失败，使用坐标盲点
        if not click_success:
            print("🏹 [Fallback] 尝试坐标点击 (20, 30)...")
            try:
                iframe.click.at(offset_x=20, offset_y=30)
            except Exception as e:
                print(f"⚠️ 坐标点击异常: {e}")

        print("⏳ 等待验证结果...")
        for i in range(25):
            time.sleep(1)
            res_ele = page.ele('css:[name="cf-turnstile-response"]')
            if res_ele and res_ele.value:
                print(f"🎉 验证通过 (Token生成耗时: {i+1}s)")
                return True
            
        print("❌ 验证超时，一直卡在 'Verifying' 或被拉黑")
        return False

    except Exception as e:
        print(f"🔥 Turnstile 处理发生全局异常: {e}")
        return False

def login(page, email, password):
    print("🌐 打开登录页面...")
    page.get(LOGIN_URL)
    time.sleep(3)

    print("📧 填写邮箱与密码...")
    try:
        page.ele('#login-id').input(email, clear=True)
        page.ele('#login-pw').input(password, clear=True)
    except Exception as e:
        print(f"❌ 找不到输入框，可能页面未加载或被盾拦截: {e}")
        page.get_screenshot(path="login_input_failed.png", full_page=True)
        return False

    # 处理验证码
    solve_turnstile(page)
    time.sleep(2) # 给 Token 注入留出一点时间

    print("🔑 点击登录按钮...")
    try:
        btn = page.ele('@@tag()=button@@text():ログイン') or page.ele('css:button[type="submit"]')
        if btn:
            btn.click()
        else:
            print("⚠️ 没找到登录按钮，尝试按回车")
            page.ele('#login-pw').input('\n')
    except Exception as e:
        print(f"❌ 点击登录异常: {e}")

    # 等待页面跳转
    print("⏳ 等待登录跳转...")
    for _ in range(20):
        if "login" not in page.url or "account" in page.url:
            print(f"✅ 登录成功，当前 URL: {page.url}")
            return True
        time.sleep(1)

    page.get_screenshot(path="login_failed.png", full_page=True)
    print(f"❌ 登录超时，当前 URL: {page.url}")
    return False

def get_remaining_time(page):
    """从页面提取剩余时间"""
    html_source = page.html
    match = re.search(r'残り\s*(\d{1,2}:\d{2}:\d{2})', html_source)
    if match:
        return match.group(1)

    # 备选提取逻辑
    try:
        for span in page.eles('tag:span'):
            txt = span.text
            if txt and '残り' in txt:
                m = re.search(r'(\d{1,2}:\d{2}:\d{2})', txt)
                if m:
                    return m.group(1)
    except:
        pass
    return None

def click_extend_button(page):
    """尝试点击延期按钮"""
    selectors = [
        'css:button[title="稼働時間を最大まで延長"]',
        'css:button[aria-label="稼働時間を延長"]',
        '@@tag()=button@@title():稼働時間',
    ]
    for sel in selectors:
        try:
            btn = page.ele(sel, timeout=2)
            if btn:
                print(f"✅ 找到按钮，选择器: {sel}")
                btn.click()
                print("✅ 点击成功")
                return True
        except:
            continue
    return False

def main():
    print("#" * 25)
    print("   Aida 自动登录续期 (DrissionPage 版)")
    print("#" * 25)

    IS_PROXY = os.environ.get("IS_PROXY", "false").lower() == "true"
    proxy_str = os.environ.get("PROXY_SERVER", "").strip() or "http://127.0.0.1:1081"

    # 初始化 DrissionPage 配置
    co = ChromiumOptions()
    co.headless(False) # 结合 GitHub Actions 的 xvfb-run 使用
    co.set_argument('--no-sandbox')
    co.set_argument('--disable-gpu')
    co.set_argument('--disable-dev-shm-usage')
    
    if IS_PROXY and proxy_str:
        print(f"🔗 挂载代理: {proxy_str}")
    #   co.set_proxy(proxy_str)
        co.set_argument(f'--proxy-server={proxy_str}')
    else:
        print("🌐 未使用代理，直连访问")

    print("🚀 启动浏览器")
    page = ChromiumPage(co)

    try:
        try:
            page.get("https://api.ip.sb/ip", timeout=10)
            ip_text = page.ele('tag:body').text.strip()
            print(f"📍 当前出口IP: {ip_text}")
            
            # print(f"📍 当前出口IP: {page.html.strip()}")
        except Exception:
            print("⚠️ 获取 IP 失败，继续执行")

        if not login(page, EMAIL, PASSWORD):
            msg = "❌ 登录失败，请检查账号或验证码 (详情见截图附件)"
            print(msg)
            send_tg(TG_BOT_TOKEN, TG_CHAT_ID, msg, "login_failed.png")
            return

        print("📄 导航到 Dashboard...")
        page.get(DASH_URL)

        print(f"✅ 当前 URL: {page.url}")
        current_title = page.title
        if "Mochi Hosting" in current_title or "Minecraft" in current_title:
            print(f"✅ 标题匹配: {current_title}")

        print("⏳ 等待服务器卡片数据渲染...")
        time_text = None
        # 最多等待 30 秒 (15次 * 2秒)
        for i in range(15):
            time.sleep(2)
            time_text = get_remaining_time(page)
            if time_text:
                print(f"✅ 数据加载完毕！耗时约 {(i+1)*2} 秒")
                break
            if i % 3 == 0:
                print(f"   ...仍在加载中 ({(i+1)*2}s)")

        if not time_text:
            msg = "❌ 未找到剩余时间信息"
            print(msg)
            page.get_screenshot(path="dashboard_no_time.png", full_page=True)
            send_tg(TG_BOT_TOKEN, TG_CHAT_ID, msg, "dashboard_no_time.png")
            return

        print(f"🕒 当前剩余时间: {time_text}")

        if re.search(r'^(23:59|24:00)', time_text):
            msg = f"✅ 已自动续期（时间已是 23:59 或 24:00）\n{time_text}"
            print(msg)
            send_tg(TG_BOT_TOKEN, TG_CHAT_ID, msg)
            return

        print("🔄 尝试点击延期按钮...")
        if not click_extend_button(page):
            msg = "❌ 未找到或无法点击延期按钮"
            print(msg)
            page.get_screenshot(path="dashboard_no_button.png", full_page=True)
            send_tg(TG_BOT_TOKEN, TG_CHAT_ID, msg, "dashboard_no_button.png")
            return

        time.sleep(4)
        new_time_text = get_remaining_time(page)
        if not new_time_text:
            new_time_text = "未获取到"
        print(f"🕒 续期后剩余时间: {new_time_text}")

        success = bool(re.search(r'^(23:59|24:00)', new_time_text))
        masked = mask_email(EMAIL)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        status = "✅ 续期成功" if success else "❌ 续期失败,时间未变为23:59或24:00"
        
        msg = f"""{status}
👤 登录账户: {masked}
📅 到期时间: {new_time_text}
⏱️ 续期时间: {now_str}"""
        if not success:
            msg += f"\n原剩余时间: {time_text}"

        print(msg)
        page.get_screenshot(path="final_status.png", full_page=True)
        send_tg(TG_BOT_TOKEN, TG_CHAT_ID, msg, "final_status.png" if not success else None)

    finally:
        print("🏁 脚本执行完毕，关闭浏览器")
        page.quit()

if __name__ == "__main__":
    main()
