// Serializes room creation without buffering a request while disconnected.
// A room snapshot is authoritative even if the acknowledgement arrives late.
export function createRoomClient(socket,{onBusy=()=>{},onMessage=()=>{},onCode=()=>{},timeoutMs=10000,clock={setTimeout:(callback,delay)=>setTimeout(callback,delay),clearTimeout:id=>clearTimeout(id)}}={}) {
  let busy=false,member=null,serial=0,timer=null;
  const stop=()=>{clock.clearTimeout(timer);timer=null;if(busy){busy=false;onBusy(false);}};
  const fail=message=>{stop();onMessage(message);};
  return {
    observe(snapshot){
      if(!snapshot||!Object.hasOwn(snapshot,'me'))return;
      member=snapshot.me;
      if(member&&snapshot.roomCode&&busy){stop();onCode(snapshot.roomCode);onMessage(`Đã tạo phòng ${snapshot.roomCode}. Bạn là chủ phòng.`);}
    },
    create(rawName){
      if(busy||member)return false;
      if(!socket.connected){onMessage('Chưa kết nối backend. Hãy chờ kết nối lại trước khi tạo phòng.');return false;}
      const name=typeof rawName==='string'?rawName.trim():'';
      if(!name||name.length>32||/[<>\x00-\x1f\x7f]/.test(name)){onMessage('Tên hiển thị phải có 1–32 ký tự, không chứa ký tự điều khiển hoặc dấu < >.');return false;}
      busy=true;onBusy(true);onMessage('Đang tạo phòng…');const request=++serial;
      timer=clock.setTimeout(()=>{if(request===serial&&busy&&!member)fail('Tạo phòng chưa được xác nhận. Hãy kiểm tra kết nối; lobby sẽ tự cập nhật nếu server đã tạo phòng.');},timeoutMs);
      try { socket.timeout(timeoutMs).emit('room:create',{name},(error,response)=>{
        if(request!==serial||member||!busy)return;
        if(error){fail('Không nhận được phản hồi tạo phòng. Kiểm tra kết nối backend rồi thử lại.');return;}
        if(!response?.ok){fail(`Không thể tạo phòng: ${response?.error||'Phản hồi server không hợp lệ.'}`);return;}
        if(!/^[A-Z0-9]{6}$/.test(response.roomCode||'')){fail('Server chưa trả mã phòng hợp lệ. Hãy kết nối lại để đồng bộ lobby.');return;}
        onCode(response.roomCode);onMessage(`Đã tạo phòng ${response.roomCode}. Đang đồng bộ lobby…`);
        // Keep the button locked until session/state supplies the actual player.
      }); } catch { fail('Không thể gửi yêu cầu tạo phòng. Kiểm tra kết nối rồi thử lại.'); return false; }
      return true;
    },
    connectionLost(){serial++;stop();},
    dispose(){serial++;clock.clearTimeout(timer);timer=null;busy=false;},
  };
}
