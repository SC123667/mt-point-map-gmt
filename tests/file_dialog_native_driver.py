from pathlib import Path
import sys,json,subprocess,time
root=Path(sys.argv[1]);last=0
script='''on run argv
 tell application "System Events"
  tell (first process whose unix id is (item 1 of argv as integer))
   tell splitter group 1 of sheet 1 of window "GMT 文件选择验证"
    if item 2 of argv is "cancel" then
     click button "取消"
    else
     set hit to false
     tell outline 1 of scroll area 1 of splitter group 1
      repeat with r in rows
       try
        if value of text field 1 of UI element 1 of r is item 2 of argv then
         set selected of r to true
         set hit to true
         exit repeat
        end if
       end try
      end repeat
     end tell
     if not hit then error "Fixture row not ready: " & item 2 of argv
     if exists button "打开" then
      if not enabled of button "打开" then error "Open button disabled"
      click button "打开"
     else
      click button "选择"
     end if
    end if
   end tell
  end tell
 end tell
end run'''
def action(pid,name):
 end=time.time()+8
 while time.time()<end:
  r=subprocess.run(['osascript','-',str(pid),name],input=script,text=True,capture_output=True)
  if r.returncode==0:return
  time.sleep(.15)
 raise RuntimeError(r.stderr)
end=time.time()+100
while time.time()<end:
 p=root/'native-control.json'
 if not p.exists():time.sleep(.1);continue
 try:m=json.loads(p.read_text())
 except json.JSONDecodeError:time.sleep(.1);continue
 if m['step']==-1:raise RuntimeError(m['action'])
 if m['action']=='done':print('NATIVE_CONTROLLER_DONE');break
 if m['step']==last:time.sleep(.1);continue
 print('NATIVE_STEP',m['step'],m['action'],flush=True)
 if m['action']=='cancel':action(m['pid'],'cancel')
 elif m['action']=='nested-file':
  action(m['pid'],'nested');time.sleep(.4);action(m['pid'],'nested.geojson')
 elif m['action']=='root-file':action(m['pid'],'root.geojson')
 elif m['action']=='nested-folder':action(m['pid'],'nested')
 else:raise RuntimeError(m)
 last=m['step']
else:raise RuntimeError('Native controller timeout')
