const AI_MODELS = [
  { id:"gpt-4o", name:"OpenAI GPT-4o", provider:"openai", keyName:"openai" },
  { id:"gpt-4o-mini", name:"OpenAI GPT-4o Mini", provider:"openai", keyName:"openai" },
  { id:"claude-3-5-sonnet-20241022", name:"Claude 3.5 Sonnet", provider:"anthropic", keyName:"anthropic" },
  { id:"claude-3-haiku-20240307", name:"Claude 3 Haiku", provider:"anthropic", keyName:"anthropic" },
  { id:"gemini-1.5-pro", name:"Gemini 1.5 Pro", provider:"google", keyName:"google" },
  { id:"gemini-1.5-flash", name:"Gemini 1.5 Flash", provider:"google", keyName:"google" },
  { id:"deepseek-chat", name:"DeepSeek Chat", provider:"deepseek", keyName:"deepseek" },
  { id:"mistral-large-latest", name:"Mistral Large", provider:"mistral", keyName:"mistral" },
  { id:"llama-3.1-70b-versatile", name:"Llama 3.1 70B (Groq)", provider:"groq", keyName:"groq" },
  { id:"grok-beta", name:"xAI Grok", provider:"xai", keyName:"xai" },
];
const PROVIDERS = ["openai","anthropic","google","deepseek","mistral","groq","xai"];

let currentUser=null, currentChatId=null, chats={};
function db(){ return JSON.parse(localStorage.getItem("aihub_users")||"{}"); }
function saveDb(d){ localStorage.setItem("aihub_users",JSON.stringify(d)); }

function register(){
  const u=username.value.trim(), p=password.value;
  if(!u||!p) return alert("Username/password daalein");
  const users=db(); if(users[u]) return alert("Ye username already hai!");
  users[u]={password:p,chats:{},apiKeys:{}}; saveDb(users);
  alert("Account ban gaya! Ab login karein.");
}
function login(){
  const u=username.value.trim(), p=password.value; const users=db();
  if(!users[u]||users[u].password!==p) return alert("Galat username/password");
  currentUser=u; localStorage.setItem("aihub_session",u); startApp();
}
function logout(){ localStorage.removeItem("aihub_session"); location.reload(); }

function startApp(){
  loginScreen.classList.add("hidden"); app.classList.remove("hidden");
  userBadge.textContent="👤 "+currentUser;
  loadModels(); loadChats(); loadApiFields();
}
function loadModels(){ modelSelect.innerHTML=AI_MODELS.map(m=>`<option value="${m.id}">${m.name}</option>`).join(""); }
function userData(){ return db()[currentUser]; }
function persistUser(data){ const d=db(); d[currentUser]=data; saveDb(d); }

function loadChats(){
  chats=userData().chats||{}; renderChatList();
  const ids=Object.keys(chats);
  if(ids.length) openChat(ids[ids.length-1]); else newChat();
}
function newChat(){
  const id="chat_"+Date.now();
  chats[id]={title:"Nayi Chat",messages:[],model:AI_MODELS[0].id};
  saveChats(); openChat(id);
}
function openChat(id){ currentChatId=id; modelSelect.value=chats[id].model||AI_MODELS[0].id; renderMessages(); renderChatList(); }
function deleteChat(id,e){ e.stopPropagation(); if(!confirm("Delete chat?"))return; delete chats[id]; saveChats(); const ids=Object.keys(chats); if(ids.length)openChat(ids[ids.length-1]); else newChat(); }
function saveChats(){ const data=userData(); data.chats=chats; persistUser(data); renderChatList(); }
function renderChatList(){ chatList.innerHTML=Object.entries(chats).reverse().map(([id,c])=>`<div class="chat-item ${id===currentChatId?'active':''}" onclick="openChat('${id}')"><span>${c.title}</span><button class="del" onclick="deleteChat('${id}',event)">🗑</button></div>`).join(""); }
function renderMessages(){
  const c=chats[currentChatId];
  if(!c.messages.length){ messages.innerHTML=`<div class="welcome"><h2>Namaste! 👋</h2><p>Message likhein.</p></div>`; return; }
  messages.innerHTML=c.messages.map(m=>`<div class="msg ${m.role==='user'?'user':'ai'}"><div class="role">${m.role==='user'?'Aap':'AI'}</div>${escapeHtml(m.content)}</div>`).join("");
  messages.scrollTop=messages.scrollHeight;
}
function escapeHtml(t){ return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

async function sendMessage(){
  const text=userInput.value.trim(); if(!text)return;
  const c=chats[currentChatId]; c.model=modelSelect.value;
  c.messages.push({role:"user",content:text});
  if(c.title==="Nayi Chat") c.title=text.slice(0,28);
  userInput.value=""; renderMessages(); saveChats();

  const model=AI_MODELS.find(m=>m.id===c.model);
  const apiKey=(userData().apiKeys||{})[model.keyName];
  if(!apiKey){ c.messages.push({role:"assistant",content:`⚠️ ${model.keyName} ki API key nahi hai. Settings mein daalein.`}); renderMessages(); saveChats(); return; }

  c.messages.push({role:"assistant",content:"⏳ Soch raha hoon..."}); renderMessages();
  try{
    const r=await fetch("/api/chat",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ provider:model.provider, model:model.id, apiKey,
        messages:c.messages.filter(m=>m.content!=="⏳ Soch raha hoon...").map(m=>({role:m.role,content:m.content})) })
    });
    const d=await r.json();
    if(d.error) throw new Error(d.error);
    c.messages[c.messages.length-1]={role:"assistant",content:d.reply};
  }catch(err){ c.messages[c.messages.length-1]={role:"assistant",content:"❌ Error: "+err.message}; }
  renderMessages(); saveChats();
}

function loadApiFields(){ apiKeyFields.innerHTML=PROVIDERS.map(p=>{ const v=(userData().apiKeys||{})[p]||""; return `<div class="api-field"><label>${p.toUpperCase()} API Key</label><input type="password" id="key_${p}" value="${v}" placeholder="key daalein..."></div>`; }).join(""); }
function openSettings(){ loadApiFields(); settingsModal.classList.remove("hidden"); }
function closeSettings(){ settingsModal.classList.add("hidden"); }
function saveSettings(){ const data=userData(); data.apiKeys={}; PROVIDERS.forEach(p=>data.apiKeys[p]=document.getElementById("key_"+p).value.trim()); persistUser(data); alert("✅ Save ho gaya!"); closeSettings(); }

const username=document.getElementById("username"), password=document.getElementById("password");
const loginScreen=document.getElementById("loginScreen"), app=document.getElementById("app");
const modelSelect=document.getElementById("modelSelect"), userBadge=document.getElementById("userBadge");
const chatList=document.getElementById("chatList"), messages=document.getElementById("messages");
const userInput=document.getElementById("userInput"), settingsModal=document.getElementById("settingsModal");
const apiKeyFields=document.getElementById("apiKeyFields");

userInput?.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();} });
userInput?.addEventListener("input",()=>{ userInput.style.height="auto"; userInput.style.height=userInput.scrollHeight+"px"; });
const session=localStorage.getItem("aihub_session");
if(session&&db()[session]){ currentUser=session; startApp(); }