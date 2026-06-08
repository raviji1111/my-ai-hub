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

  // AI_MODELS mein ye add karein
{ id:"deepseek-ai/deepseek-v4-pro", name:"NVIDIA DeepSeek V4", provider:"nvidia", keyName:"nvidia" },

// PROVIDERS array mein bhi "nvidia" add karein
const PROVIDERS = ["openai","anthropic","google","deepseek","mistral","groq","xai", "nvidia"];
  { id:"grok-beta", name:"xAI Grok", provider:"xai", keyName:"xai" },
];
const PROVIDERS = ["openai","anthropic","google","deepseek","mistral","groq","xai"];

let token = localStorage.getItem("aihub_token") || null;
let currentUser = localStorage.getItem("aihub_user") || null;
let currentChatId = null;
let chats = {};        // {id: {id,title,messages,model}}
let apiKeys = {};

// ===== helper: server call =====
async function api(path, method = "GET", body) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

// ===== AUTH =====
async function register() {
  const u = username.value.trim(), p = password.value;
  if (!u || !p) return alert("Username/password daalein");
  const d = await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({username:u,password:p}) }).then(r=>r.json());
  if (d.error) return alert(d.error);
  alert("Account ban gaya! Ab login karein.");
}
async function login() {
  const u = username.value.trim(), p = password.value;
  const d = await fetch("/api/login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({username:u,password:p}) }).then(r=>r.json());
  if (d.error) return alert(d.error);
  token = d.token; currentUser = d.username;
  localStorage.setItem("aihub_token", token);
  localStorage.setItem("aihub_user", currentUser);
  startApp();
}
function logout() {
  localStorage.removeItem("aihub_token");
  localStorage.removeItem("aihub_user");
  location.reload();
}

// ===== APP START =====
async function startApp() {
  loginScreen.classList.add("hidden"); app.classList.remove("hidden");
  userBadge.textContent = "👤 " + currentUser;
  loadModels();
  await loadKeys();
  await loadChats();
}
function loadModels(){ modelSelect.innerHTML = AI_MODELS.map(m=>`<option value="${m.id}">${m.name}</option>`).join(""); }

async function loadKeys(){
  const d = await api("/api/keys");
  if (d.error) { logout(); return; }
  apiKeys = d.apiKeys || {};
}

// ===== CHATS (server se) =====
async function loadChats() {
  const d = await api("/api/chats");
  chats = {};
  (d.chats || []).forEach(c => chats[c.id] = c);
  renderChatList();
  const ids = Object.keys(chats);
  if (ids.length) openChat(ids[0]); else newChat();
}
async function newChat() {
  const id = "chat_" + Date.now();
  chats[id] = { id, title: "Nayi Chat", messages: [], model: AI_MODELS[0].id };
  await api("/api/chats", "POST", chats[id]);
  openChat(id); renderChatList();
}
function openChat(id){ currentChatId=id; modelSelect.value=chats[id].model||AI_MODELS[0].id; renderMessages(); renderChatList(); }
async function deleteChat(id, e){
  e.stopPropagation();
  if(!confirm("Delete chat?")) return;
  await api("/api/chats/delete", "POST", { id });
  delete chats[id];
  const ids=Object.keys(chats);
  if(ids.length) openChat(ids[0]); else newChat();
  renderChatList();
}
async function saveCurrentChat(){
  const c = chats[currentChatId];
  await api("/api/chats", "POST", c);
}
function renderChatList(){
  chatList.innerHTML = Object.values(chats)
    .sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))
    .map(c=>`<div class="chat-item ${c.id===currentChatId?'active':''}" onclick="openChat('${c.id}')"><span>${c.title}</span><button class="del" onclick="deleteChat('${c.id}',event)">🗑</button></div>`).join("");
}
function renderMessages(){
  const c = chats[currentChatId];
  if(!c.messages.length){ messages.innerHTML=`<div class="welcome"><h2>Namaste! 👋</h2><p>Message likhein.</p></div>`; return; }
  messages.innerHTML = c.messages.map(m=>`<div class="msg ${m.role==='user'?'user':'ai'}"><div class="role">${m.role==='user'?'Aap':'AI'}</div>${escapeHtml(m.content)}</div>`).join("");
  messages.scrollTop = messages.scrollHeight;
}
function escapeHtml(t){ return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// ===== SEND MESSAGE =====
async function sendMessage(){
  const text = userInput.value.trim(); if(!text) return;
  const c = chats[currentChatId]; c.model = modelSelect.value;
  c.messages.push({ role:"user", content:text });
  if(c.title==="Nayi Chat") c.title = text.slice(0,28);
  userInput.value=""; renderMessages(); await saveCurrentChat(); renderChatList();

  const model = AI_MODELS.find(m=>m.id===c.model);
  const key = apiKeys[model.keyName];
  if(!key){ c.messages.push({role:"assistant",content:`⚠️ ${model.keyName} ki API key nahi hai. Settings mein daalein.`}); renderMessages(); await saveCurrentChat(); return; }

  c.messages.push({ role:"assistant", content:"⏳ Soch raha hoon..." }); renderMessages();
  try{
    const d = await api("/api/chat","POST",{
      provider: model.provider, model: model.id, apiKey: key,
      messages: c.messages.filter(m=>m.content!=="⏳ Soch raha hoon...").map(m=>({role:m.role,content:m.content}))
    });
    if(d.error) throw new Error(d.error);
    c.messages[c.messages.length-1] = { role:"assistant", content:d.reply };
  }catch(err){ c.messages[c.messages.length-1] = { role:"assistant", content:"❌ Error: "+err.message }; }
  renderMessages(); await saveCurrentChat();
}

// ===== API KEYS SETTINGS =====
function loadApiFields(){
  apiKeyFields.innerHTML = PROVIDERS.map(p=>{ const v=apiKeys[p]||""; return `<div class="api-field"><label>${p.toUpperCase()} API Key</label><input type="password" id="key_${p}" value="${v}" placeholder="key daalein..."></div>`; }).join("");
}
function openSettings(){ loadApiFields(); settingsModal.classList.remove("hidden"); }
function closeSettings(){ settingsModal.classList.add("hidden"); }
async function saveSettings(){
  apiKeys = {};
  PROVIDERS.forEach(p=> apiKeys[p]=document.getElementById("key_"+p).value.trim());
  await api("/api/keys","POST",{ apiKeys });
  alert("✅ Save ho gaya (database mein)!"); closeSettings();
}

// ===== ELEMENTS + EVENTS =====
const username=document.getElementById("username"), password=document.getElementById("password");
const loginScreen=document.getElementById("loginScreen"), app=document.getElementById("app");
const modelSelect=document.getElementById("modelSelect"), userBadge=document.getElementById("userBadge");
const chatList=document.getElementById("chatList"), messages=document.getElementById("messages");
const userInput=document.getElementById("userInput"), settingsModal=document.getElementById("settingsModal");
const apiKeyFields=document.getElementById("apiKeyFields");

userInput?.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();} });
userInput?.addEventListener("input",()=>{ userInput.style.height="auto"; userInput.style.height=userInput.scrollHeight+"px"; });

// auto login
if(token && currentUser) startApp();
