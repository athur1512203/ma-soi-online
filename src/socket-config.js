// VITE_SERVER_URL is substituted by Vite at build time, not at server startup.
export function resolveServerConfig(value,{dev=false,location}={}) {
  const configured=typeof value==='string'?value.trim():'';
  if(!configured&&!dev)return {url:null,error:'Thiếu VITE_SERVER_URL. Hãy cấu hình URL backend trước khi build và deploy lại frontend.'};
  const candidate=configured||`${location.protocol}//${location.hostname}:3001`;
  try{
    const url=new URL(candidate);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!url.hostname||/[<>]/.test(candidate))throw new Error();
    if(url.pathname!=='/')return {url:null,error:'VITE_SERVER_URL phải là origin backend, không thêm /socket.io hoặc đường dẫn API.'};
    if(location?.protocol==='https:'&&url.protocol!=='https:')return {url:null,error:'Trang HTTPS cần VITE_SERVER_URL bắt đầu bằng https:// để tránh bị trình duyệt chặn kết nối.'};
    return {url:url.origin,error:null};
  }catch{return {url:null,error:'VITE_SERVER_URL không hợp lệ. Dùng URL backend đầy đủ dạng https://ten-backend.onrender.com.'};}
}
