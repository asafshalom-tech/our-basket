from playwright.sync_api import sync_playwright,expect
import pathlib, os
BASE='http://127.0.0.1:8787'
OUT=pathlib.Path(os.environ.get('TEST_ARTIFACTS','/mnt/data')); OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    c1=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1,service_workers='block')
    c2=browser.new_context(viewport={'width':412,'height':915},is_mobile=True,has_touch=True,device_scale_factor=1,service_workers='block')
    a=c1.new_page(); b=c2.new_page(); errors=[]
    for page,i in [(a,0),(b,1)]:
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.goto(BASE+f'/test-user?id={i}');expect(page.locator('#draft')).to_be_enabled(timeout=10000);expect(page.get_by_text('מסונכרן עם הבית')).to_be_visible(timeout=10000)
    expect(a.locator('html')).to_have_attribute('dir','rtl');a.screenshot(path=str(OUT/'basket-mobile-empty.png'))
    a.locator('#draft').fill('2 חלב 3%, קילו עגבניות ולחם מלא');a.locator('#add-form button.primary').click();expect(a.locator('.preview-row')).to_have_count(3);a.screenshot(path=str(OUT/'basket-preview.png'));a.locator('#preview-form button.primary').click();expect(a.locator('.item')).to_have_count(3);expect(b.locator('.item')).to_have_count(3,timeout=12000);a.screenshot(path=str(OUT/'basket-mobile.png'))
    a.get_by_role('button',name='נכנס לעגלה: חלב 3%').click();expect(b.locator('summary').filter(has_text='כבר בעגלה')).to_be_visible(timeout=12000);b.locator('summary').filter(has_text='כבר בעגלה').click();b.get_by_role('button',name='החזר לרשימה: חלב 3%').click();expect(a.get_by_role('button',name='נכנס לעגלה: חלב 3%')).to_be_visible(timeout=12000)
    c1.set_offline(True);a.get_by_role('button',name='נכנס לעגלה: עגבניות').click();expect(a.get_by_text('1 שינויים ממתינים לסנכרון')).to_be_visible();expect(b.get_by_role('button',name='נכנס לעגלה: עגבניות')).to_be_visible();c1.set_offline(False);expect(b.locator('summary').filter(has_text='כבר בעגלה')).to_be_visible(timeout=12000);expect(a.get_by_text('מסונכרן עם הבית')).to_be_visible(timeout=12000)
    a.locator('.bottom button[data-page=history]').click();expect(a.get_by_text('עגבניות',exact=True)).to_be_visible();a.screenshot(path=str(OUT/'basket-history.png'))
    # Same browser context: second tab must not edit.
    other=c1.new_page();other.goto(BASE+'/');expect(other.get_by_text('הרשימה פתוחה לעריכה בלשונית אחרת.')).to_be_visible(timeout=10000);expect(other.locator('#draft')).to_be_disabled();other.close()
    # Desktop responsive layout, second authorized identity
    desk=browser.new_context(viewport={'width':1280,'height':900},service_workers='block');d=desk.new_page();d.goto(BASE+'/test-user?id=1');expect(d.locator('#draft')).to_be_enabled(timeout=10000);d.screenshot(path=str(OUT/'basket-desktop.png'));assert d.evaluate('document.documentElement.scrollWidth===innerWidth');assert a.evaluate('document.documentElement.scrollWidth===innerWidth');assert not errors,errors
    print('PASS: two isolated browser contexts, RTL, three-product preview, shared purchase, undo, offline pending/reconnect, history, tab lock, desktop/mobile widths, no JS errors')
    browser.close()
