// One shared transaction prevents create/join races and never buffers offline requests.
export function createRoomClient(socket,{onBusy=()=>{},onMessage=()=>{},onCode=()=>{},onAction=()=>{},timeoutMs=10000,clock={setTimeout:(callback,delay)=>setTimeout(callback,delay),clearTimeout:id=>clearTimeout(id)}}={}) {
  let busy=false,member=null,serial=0,timer=null,action='create';
  const stop=()=>{clock.clearTimeout(timer);timer=null;if(busy){busy=false;onBusy(false);onAction(null);}};
  const fail=message=>{stop();onMessage(message);};
  function send(kind,rawName,rawCode){
    if(busy||member)return false;
    if(!socket.connected){onMessage('Chưa kết nối backend. Hãy chờ kết nối lại trước khi tạo phòng hoặc tham gia.');return false;}
    const name=typeof rawName==='string'?rawName.trim():'';
    if(!name){onMessage('Vui lòng nhập tên hiển thị trước khi tạo hoặc tham gia phòng.');return false;}
    if(name.length>32||/[<>\x00-\x1f\x7f]/.test(name)){onMessage('Tên hiển thị phải có 1–32 ký tự, không chứa ký tự điều khiển hoặc dấu < >.');return false;}
    const roomCode=typeof rawCode==='string'?rawCode.trim().toUpperCase():'';
    if(kind==='join'&&!/^[A-Z0-9]{6}$/.test(roomCode)){onMessage('Mã phòng phải gồm 6 ký tự chữ và số.');return false;}
    action=kind;const label=kind==='join'?'tham gia phòng':'tạo phòng';
    busy=true;onBusy(true);onAction(kind);onMessage(`Đang ${label}…`);const request=++serial;
    timer=clock.setTimeout(()=>{if(request===serial&&busy&&!member)fail('Yêu cầu chưa được xác nhận. Hãy kiểm tra kết nối; lobby sẽ tự cập nhật nếu server đã xử lý.');},timeoutMs);
    try {socket.timeout(timeoutMs).emit(`room:${kind}`,kind==='join'?{name,roomCode}:{name},(error,response)=>{
      if(request!==serial||member||!busy)return;
      if(error){fail(`Không nhận được phản hồi ${label}. Kiểm tra kết nối backend rồi thử lại.`);return;}
      if(!response?.ok){fail(`Không thể ${label}: ${response?.error||'Phản hồi server không hợp lệ.'}`);return;}
      if(!/^[A-Z0-9]{6}$/.test(response.roomCode||'')){fail('Server chưa trả mã phòng hợp lệ. Hãy kết nối lại để đồng bộ lobby.');return;}
      onCode(response.roomCode);onMessage(`Đã ${label} ${response.roomCode}. Đang đồng bộ lobby…`);
    });}catch{fail('Không thể gửi yêu cầu phòng. Kiểm tra kết nối rồi thử lại.');return false;}
    return true;
  }
  return {
    observe(snapshot){
      if(!snapshot||!Object.hasOwn(snapshot,'me'))return;
      member=snapshot.me;
      if(member&&snapshot.roomCode&&busy){stop();onCode(snapshot.roomCode);onMessage(action==='join'?`Đã tham gia phòng ${snapshot.roomCode}.`:`Đã tạo phòng ${snapshot.roomCode}. Bạn là chủ phòng.`);}
    },
    create:name=>send('create',name),
    join:(name,code)=>send('join',name,code),
    connectionLost(){serial++;stop();},
    dispose(){serial++;clock.clearTimeout(timer);timer=null;busy=false;},
  };
}
