// IBKR data remains private on the pilot machine. No public relay is enabled.
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  return res.json({enabled:false,connected:false,status:'local-pilot-only',assets:[],note:'IBKR quotes are available in the private local pilot. A hosted connection has not been configured.'});
}
