// BroadcastChannel로 PeerJS를 흉내 낸다. 페이지가 닫히거나 destroy되면 상대에게 close가 전달된다.
module.exports = `(()=>{const bc=new BroadcastChannel('mock');
class Conn{constructor(peer,remote,local){this.peer=remote;this.local=local;this.h={};this.open=false;this.owner=peer;this.closed=false}
 on(e,f){this.h[e]=f}emit(e,d){this.h[e]&&this.h[e](d)}send(d){bc.postMessage({to:this.peer,from:this.local,d:JSON.parse(JSON.stringify(d))})}
 close(){if(this.closed)return;this.closed=true;bc.postMessage({to:this.peer,from:this.local,close:1});this.emit('close')}}
window.Peer=class{constructor(id){this.id=id||'r'+Math.random().toString(36).slice(2,8);this.h={};this.conns={};this.dead=false;
 bc.addEventListener('message',m=>{if(this.dead)return;const x=m.data;if(x.to!==this.id)return;
  if(x.hello){const c=new Conn(this,x.from,this.id);this.conns[x.from]=c;this.h.connection&&this.h.connection(c);bc.postMessage({to:x.from,from:this.id,ack:1});c.open=true;c.emit('open')}
  else if(x.ack){const c=this.conns[x.from];c.open=true;c.emit('open')}
  else if(x.close){const c=this.conns[x.from];if(c&&!c.closed){c.closed=true;c.emit('close')}}
  else{const c=this.conns[x.from];c&&c.emit('data',x.d)}});
 addEventListener('pagehide',()=>this.destroy());
 setTimeout(()=>this.h.open&&this.h.open(this.id),10)}
 on(e,f){this.h[e]=f}reconnect(){}destroy(){if(this.dead)return;this.dead=true;for(const k in this.conns)this.conns[k].close()}
 connect(id){const c=new Conn(this,id,this.id);this.conns[id]=c;bc.postMessage({to:id,from:this.id,hello:1});return c}}})()`;
