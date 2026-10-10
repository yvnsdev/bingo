globalThis.runAuthTests = async () => {
  let count=0;
  const assert=(ok,message)=>{if(!ok)throw new Error(message);count++;};
  const memory=new Map();
  const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  globalThis.AbortSignal={timeout:()=>undefined};
  let calls=[],invalid=0,refreshFails=false,networkFails=false;
  const request=async(url,options)=>{
    calls.push({url,options});
    if(networkFails)throw new Error('Offline');
    if(url.endsWith('/user'))return {ok:true,status:200,json:async()=>({id:'host-1',email:'host@example.com'})};
    if(url.includes('/logout'))return {ok:true,status:204};
    if(refreshFails)return {ok:false,status:400,json:async()=>({error_code:'refresh_token_not_found'})};
    const refresh=url.includes('refresh_token');
    return {ok:true,status:200,json:async()=>({access_token:refresh?'renewed':'access',refresh_token:refresh?'next-refresh':'refresh',expires_in:3600,user:{id:'host-1',email:'host@example.com'}})};
  };
  const client=createBingoAuth({url:'https://example.supabase.co/',key:'public-key',storage,request,locks:null,onInvalid:()=>invalid++});
  assert(await client.accessToken()===null,'No JWT before sign in');
  await client.signIn('host@example.com','private-password');
  assert(calls[0].url==='https://example.supabase.co/auth/v1/token?grant_type=password','Uses Supabase password endpoint');
  assert(JSON.parse(calls[0].options.body).password==='private-password','Password sent to Auth');
  assert(![...memory.values()].join('').includes('private-password'),'Password never stored');
  assert(await client.accessToken()==='access'&&calls.length===1,'Valid token reused');
  assert((await client.validate()).id==='host-1','Restored session verified with Auth');
  assert(calls.at(-1).options.headers.Authorization==='Bearer access','Verification uses user JWT');
  const expired=client.session();expired.expires_at=0;storage.setItem(client.storageKey,JSON.stringify(expired));
  const before=calls.length;
  const renewed=await Promise.all([client.accessToken(),client.accessToken()]);
  assert(renewed.every(t=>t==='renewed')&&calls.length===before+1,'Concurrent refresh requests deduplicated');
  assert(client.session().refresh_token==='next-refresh','Rotated refresh token saved');
  networkFails=true;
  try{await client.accessToken(true);}catch{}
  assert(client.session()!==null,'Transient network error retains session');networkFails=false;
  refreshFails=true;
  try{await client.accessToken(true);}catch{}
  assert(client.session()===null&&invalid===1,'Invalid refresh signs out and locks panel');
  refreshFails=false;await client.signIn('host@example.com','private-password');await client.signOut();
  assert(client.session()===null&&invalid===2,'Sign out clears browser session');
  assert(calls.at(-1).url.endsWith('logout?scope=local'),'Sign out revokes the Supabase session');
  return `${count} auth assertions passed`;
};
