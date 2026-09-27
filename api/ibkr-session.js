import {privateHeaders} from '../lib/ibkr-relay.js';
// Retire the shared workspace-key login. Only personal sign-in creates sessions.
export function createHandler(){return async(req,res)=>{privateHeaders(res);return res.status(410).json({error:'Use the Northstar sign-in page.'})}}
export default createHandler();
