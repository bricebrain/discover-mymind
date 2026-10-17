/** Connexion active pendant la consultation, reconnexion avec temporisation, arrêt propre. */
export function watchPreparations(configure:()=>Promise<unknown>,onLive:(live:boolean)=>void,onChange:()=>void) {
    const isVisible=()=>document.visibilityState!=='hidden';
    let disposed=false,socket:WebSocket|null=null,retry:ReturnType<typeof setTimeout>|undefined;
    let debounce:ReturnType<typeof setTimeout>|undefined,ping:ReturnType<typeof setInterval>|undefined,attempt=0,connecting=false,pong=true;
    const invalidate=()=>{
      if(debounce) return;
      debounce=setTimeout(()=>{debounce=undefined;onChange();},100);
    };
    const close=()=>{clearTimeout(retry);clearInterval(ping);socket?.close();socket=null;onLive(false);};
    const connect=async()=>{
      if(disposed || !isVisible() || !navigator.onLine || socket || connecting) return;
      connecting=true;
      try {
        // Le cookie d'appareil HttpOnly permet d'éviter une notification sur cet appareil pendant sa consultation.
        await configure();
        if(disposed || !isVisible() || !navigator.onLine) return;
        const url=new URL('/api/events',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
        const ws=new WebSocket(url);socket=ws;pong=true;
        ws.onmessage=({data})=>{
          if(socket!==ws) return;
          if(data==='pong') {pong=true;return;}
          try {
            const event=JSON.parse(data);
            if(event.type==='connected') {attempt=0;onLive(true);invalidate();}
            if(event.type==='queue.changed') invalidate();
          } catch {ws.close();}
        };
        ws.onopen=()=>{if(socket!==ws){ws.close();return;}ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN) {if(!pong){ws.close();return;}pong=false;ws.send('ping');}},30_000);};
        ws.onerror=()=>ws.close();
        ws.onclose=()=>{
          if(socket!==ws) return;
          clearInterval(ping);socket=null;onLive(false);
          if(!disposed && isVisible() && navigator.onLine) retry=setTimeout(()=>void connect(),Math.min(30_000,1000*2**attempt++)+Math.random()*500);
        };
      } catch {if(!disposed) retry=setTimeout(()=>void connect(),30_000);}
      finally{connecting=false;}
    };
    const visibility=()=>{if(!isVisible()) close();else {invalidate();void connect();}};
    const offline=()=>close();
    document.addEventListener('visibilitychange',visibility);window.addEventListener('online',visibility);window.addEventListener('offline',offline);
    void connect();
    return ()=>{disposed=true;close();clearTimeout(debounce);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',visibility);window.removeEventListener('offline',offline);};
}
