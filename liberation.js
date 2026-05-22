:root{--bg:#0f0f11;--surf:#17171c;--surf2:#1e1e26;--brd:#2a2a36;--acc:#e8c84a;--acc2:#c4a832;--txt:#e8e8ee;--txt2:#9090a8;--mut:#5a5a72;--dan:#e85a4a;}
*{box-sizing:border-box;}
body{background:var(--bg);color:var(--txt);font-family:system-ui,-apple-system,sans-serif;font-size:16px;min-height:100vh;padding-bottom:60px;}
.app-hdr{
  background:linear-gradient(180deg,#161616 0%,#111116 100%);
  border-bottom:1px solid var(--brd);
  padding:28px 20px 24px;
  text-align:center;
  position:relative;
}
.app-hdr::after{
  content:'';position:absolute;bottom:0;left:50%;transform:translateX(-50%);
  width:60px;height:2px;background:var(--acc);border-radius:2px;
}
.hdr-in{max-width:640px;margin:0 auto;}
.hdr-badge{
  display:inline-block;
  font-family:monospace;font-size:9px;letter-spacing:3px;
  text-transform:uppercase;color:var(--mut);
  border:1px solid var(--brd);border-radius:20px;
  padding:3px 12px;margin-bottom:10px;
}
.hdr-in h1{
  font-size:22px;font-weight:700;color:var(--acc);margin:0;
  letter-spacing:0.5px;line-height:1.2;
}
.hdr-in p{
  font-size:10px;color:var(--mut);letter-spacing:3px;
  text-transform:uppercase;margin:6px 0 0;font-family:monospace;
}
.main{max-width:640px;margin:0 auto;padding:18px 16px 0;}
.dc{background:var(--surf);border:1px solid var(--brd);border-radius:12px;padding:20px;margin-bottom:14px;}
.cl{font-family:monospace;font-size:11px;letter-spacing:2px;color:var(--acc);text-transform:uppercase;margin-bottom:16px;display:flex;align-items:center;gap:10px;}
.cl::after{content:'';flex:1;height:1px;background:var(--brd);}
.fl{font-family:monospace;font-size:11px;letter-spacing:1px;color:var(--mut);text-transform:uppercase;display:block;margin-bottom:5px;}
.fi{background:var(--surf2);border:1px solid var(--brd);border-radius:8px;color:var(--txt);font-size:15px;padding:11px 13px;width:100%;outline:none;-webkit-appearance:none;transition:border-color .15s,box-shadow .15s;}
.fi:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(232,200,74,.1);}
.fi[readonly]{color:var(--mut);}
.aw{position:relative;} .aw .fi{padding-right:34px;}
.ct{position:absolute;right:11px;top:50%;transform:translateY(-50%);color:var(--mut);font-family:monospace;font-size:12px;pointer-events:none;}
.uz{border:1.5px dashed var(--brd);border-radius:8px;padding:14px;text-align:center;cursor:pointer;position:relative;min-height:64px;display:flex;align-items:center;justify-content:center;transition:border-color .15s;}
.uz:hover{border-color:var(--acc);}
.uz input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;padding:0;background:none;border:none;}
.uh{font-size:12px;color:var(--mut);line-height:1.4;}
.up{max-width:80px;max-height:56px;object-fit:contain;}
.bd{background:var(--acc);color:#0f0f11;border:none;border-radius:10px;font-size:16px;font-weight:700;padding:16px;width:100%;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .15s,transform .1s;}
.bd:hover{background:var(--acc2);} .bd:active{transform:scale(0.97);}
.bh{background:transparent;color:var(--txt2);border:1px solid var(--brd);border-radius:10px;font-size:15px;font-weight:500;padding:14px;width:100%;cursor:pointer;transition:border-color .15s,color .15s;}
.bh:hover{border-color:#5a9aff;color:#5a9aff;}
.idiv{height:1px;background:var(--brd);margin:16px 0;}












.hi:hover{border-color:var(--acc);}

 




.hi-x:hover{color:var(--dan);background:rgba(232,90,74,.1);}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--surf);border:1px solid var(--brd);color:var(--txt);font-size:13px;padding:10px 20px;border-radius:30px;z-index:200;transition:transform .3s,opacity .3s;opacity:0;white-space:nowrap;}
.toast.show{transform:translateX(-50%) translateY(0);opacity:1;}
.hint{font-size:11px;color:var(--mut);text-align:center;line-height:1.7;margin-top:4px;}
@keyframes loginPulse{0%{box-shadow:0 0 0 0 rgba(232,128,58,.7);}70%{box-shadow:0 0 0 7px rgba(232,128,58,0);}100%{box-shadow:0 0 0 0 rgba(232,128,58,0);}}
@keyframes fadeInUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
@keyframes textPulse{0%,100%{opacity:.5;}50%{opacity:1;}}
@keyframes hgRotate{0%,42%{transform:rotate(0deg);}50%,92%{transform:rotate(180deg);}100%{transform:rotate(360deg);}}
@keyframes hgGlow{0%,100%{filter:drop-shadow(0 0 4px rgba(232,128,58,.3));}50%{filter:drop-shadow(0 0 10px rgba(232,128,58,.6));}}
.google-overlay{position:fixed;inset:0;background:rgba(10,10,14,.95);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;backdrop-filter:blur(8px);}
.google-overlay-text{font-family:monospace;font-size:12px;color:#e8803a;letter-spacing:4px;animation:textPulse 2s ease infinite;}
.google-overlay-sub{font-family:monospace;font-size:10px;color:#444;letter-spacing:3px;}
.hg-svg-wrap{animation:hgRotate 2.4s ease-in-out infinite, hgGlow 2.4s ease-in-out infinite;}
.hg-svg{width:56px;height:84px;}
.bh-archive{border-color:#e8c84a;color:#e8c84a;}
.bh-archive:hover{border-color:#e8c84a;background:rgba(232,200,74,.08);}
.bh-archive:disabled{opacity:.5;cursor:not-allowed;}
.bh-email{border-color:#ea4335;color:#ea4335;}
.bh-email:hover{border-color:#ea4335;background:rgba(234,67,53,.08);}
.bh-sign{border-color:#9c27b0;color:#9c27b0;}
.bh-sign:hover{border-color:#9c27b0;background:rgba(156,39,176,.08);}
.bh-analytics{border-color:#34a853;color:#34a853;}
.bh-analytics:hover{border-color:#34a853;background:rgba(52,168,83,.08);}
/* Toggle switch */
.toggle-switch{position:relative;display:inline-block;width:48px;height:26px;flex-shrink:0;}
.toggle-switch input{opacity:0;width:0;height:0;}
.toggle-slider{position:absolute;cursor:pointer;inset:0;background:#2a2a36;border-radius:26px;transition:background .25s;}
.toggle-slider::before{content:"";position:absolute;width:20px;height:20px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:transform .25s,background .25s;box-shadow:0 1px 4px rgba(0,0,0,.3);}
.toggle-switch input:checked + .toggle-slider{background:var(--acc);}
.toggle-switch input:checked + .toggle-slider::before{transform:translateX(22px);background:#0f0f11;}
.stamp-zone-disabled{opacity:.35;pointer-events:none;}
.bh-drive{border-color:#4285f4;color:#4285f4;}
.bh-drive:hover{border-color:#4285f4;background:rgba(66,133,244,.08);}
.drive-msg{font-size:11px;text-align:center;min-height:16px;margin-bottom:6px;transition:color .2s;}
.drive-msg.ok{color:#4ae8a0;} .drive-msg.err{color:var(--dan);} .drive-msg.info{color:var(--mut);}
.parse-box{background:var(--surf2);border:1px solid var(--brd);border-radius:10px;padding:14px;margin-bottom:14px;display:none;}
.parse-box h3{font-family:monospace;font-size:10px;letter-spacing:2px;color:var(--acc);text-transform:uppercase;margin-bottom:10px;}
.prow{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--brd);}
.prow:last-child{border-bottom:none;} .pk{color:var(--mut);flex-shrink:0;margin-right:8px;} .pv{color:var(--txt);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%;}
.pbtns{display:flex;gap:8px;margin-top:12px;}
.pbtn-ok{background:var(--acc);color:#0f0f11;border:none;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;flex:1;}
.pbtn-no{background:transparent;color:var(--mut);border:1px solid var(--brd);border-radius:8px;padding:9px 16px;font-size:13px;cursor:pointer;}