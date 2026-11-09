import subprocess,os,sys
from playwright.sync_api import sync_playwright
FPS=30
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':720})
    pg.goto('file:///home/claude/work/lessons/lessons.html?film=1'); pg.wait_for_timeout(600)
    info=pg.evaluate('lessonAPI.lessons()')
    for li,l in enumerate(info):
        name=f"video/{li+1:02d}-{l['title'].lower().replace(' & ','-').replace(' ','-')}.mp4"; tmp=name[:-4]+'.part.mp4'
        ff=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','image2pipe','-framerate',str(FPS),'-c:v','mjpeg','-i','-',
            '-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r',str(FPS),'-movflags','+faststart',tmp],stdin=subprocess.PIPE)
        for si,d in enumerate(l['steps']):
            pg.evaluate(f'lessonAPI.show({li},{si})')
            for f in range(int(round(d*FPS))):
                pg.evaluate(f'lessonAPI.seek({f/FPS})')
                ff.stdin.write(pg.screenshot(type='jpeg',quality=92))
        ff.stdin.close(); rc=ff.wait()
        if rc==0: os.replace(tmp,name); print('ok',name,flush=True)
        else: print('FAIL',name,flush=True)
    b.close()
