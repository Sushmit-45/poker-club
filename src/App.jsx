// src/App.js
import { useState, useEffect, useRef, useCallback } from "react";
import { DB } from "./firebase";

// ─── FONTS (injected once) ────────────────────────────────────────────────────
if (!document.getElementById("pk-fonts")) {
  const l = document.createElement("link");
  l.id   = "pk-fonts";
  l.rel  = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Outfit:wght@300;400;500;600&display=swap";
  document.head.appendChild(l);
}
const FD = "'Cormorant Garamond', Georgia, serif";   // display / numbers
const FU = "'Outfit', system-ui, sans-serif";         // UI text

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SUIT_SYMBOLS = { S:"♠", H:"♥", D:"♦", C:"♣" };
const RANKS  = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const SUITS  = ["S","H","D","C"];
const CHIPS  = {
  green:  { v:10,  hex:"#15803d", label:"Green"  },
  red:    { v:5,   hex:"#b91c1c", label:"Red"     },
  black:  { v:50,  hex:"#1c1c1c", label:"Black"   },
  white:  { v:100, hex:"#e8e0d8", label:"White"   },
  purple: { v:25,  hex:"#6d28d9", label:"Purple"  },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const uid      = ()  => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const rs       = n   => `₹${Number(n).toLocaleString("en-IN")}`;
const pnl      = p   => (p.cashout??0) - p.buyIn - (p.loans??0);
const chipSum  = c   => Object.entries(c||{}).reduce((s,[k,n])=>s+(CHIPS[k]?.v||0)*n,0);
const mean     = a   => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const variance = a   => { if(a.length<2)return 0; const m=mean(a); return mean(a.map(x=>(x-m)**2)); };

const AVATAR_PALETTE = ["#7f1d1d","#44403c","#1c1917","#292524","#78350f","#3b0764","#134e4a","#1e3a5f"];
const avColor  = name  => AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
const initials = name  => name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

// Minimum cash-flow settlement algorithm
function settle(players) {
  const nets = players.map(p => ({ name: p.name, bal: Math.round(pnl(p)) }));
  const creditors = nets.filter(x=>x.bal>0).sort((a,b)=>b.bal-a.bal);
  const debtors   = nets.filter(x=>x.bal<0).sort((a,b)=>a.bal-b.bal);
  const txns = [];
  let ci=0, di=0;
  const c=[...creditors.map(x=>({...x}))], d=[...debtors.map(x=>({...x}))];
  while (ci<c.length && di<d.length) {
    const amt = Math.min(c[ci].bal, -d[di].bal);
    if (amt > 0) txns.push({ from:d[di].name, to:c[ci].name, amount:amt });
    c[ci].bal += d[di].bal; // subtract debtor amount
    d[di].bal += amt;
    if (Math.abs(c[ci].bal)<1) ci++;
    if (Math.abs(d[di].bal)<1) di++;
  }
  return txns;
}

// ─── GLOBAL USER ID (browser-scoped) ─────────────────────────────────────────
function getOrCreateUserId() {
  let id = localStorage.getItem("pk_uid");
  if (!id) { id = uid(); localStorage.setItem("pk_uid",id); }
  return id;
}
const MY_ID = getOrCreateUserId();
let MY_NAME = localStorage.getItem("pk_name") || "";

// ─── STYLE TOKENS ─────────────────────────────────────────────────────────────
const IS = {
  background:"#0c0707", border:"1px solid #3d1515",
  borderRadius:6, padding:"9px 12px", color:"#ede5d8",
  fontSize:15, fontFamily:FD, width:"100%", outline:"none", boxSizing:"border-box"
};
const LS = { fontSize:11, color:"#8a7060", fontFamily:FU, fontWeight:500, letterSpacing:"0.07em", textTransform:"uppercase", display:"flex", flexDirection:"column", gap:5, flex:1 };

function btn(type="gold", size="md") {
  const base = { cursor:"pointer", borderRadius:6, border:"none", transition:"all 0.15s", fontFamily:FU, fontWeight:500, letterSpacing:"0.02em" };
  const sz   = { sm:{padding:"5px 12px",fontSize:12}, md:{padding:"9px 18px",fontSize:13}, lg:{padding:"11px 24px",fontSize:14} };
  const t    = {
    gold:   { background:"#c9a84c", color:"#0a0707" },
    ghost:  { background:"transparent", color:"#7a6050", border:"1px solid #3d1515" },
    danger: { background:"#4a0c0c", color:"#f87171", border:"1px solid #7f1d1d" },
    green:  { background:"#14532d", color:"#86efac", border:"1px solid #166534" },
  };
  return {...base,...sz[size],...t[type]};
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function Panel({ children, style, onClick, glow }) {
  const [hov,setHov] = useState(false);
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={onClick}
      style={{ background:"#110b0b", border:`1px solid ${(hov&&onClick)||glow?"#c9a84c":"#2e1010"}`, borderRadius:12, padding:"18px 20px", transition:"border-color 0.2s", ...style }}>
      {children}
    </div>
  );
}

function Avatar({ name, size=36 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:avColor(name), display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.34, fontWeight:600, color:"#ede5d8", fontFamily:FU, border:"1.5px solid rgba(201,168,76,0.4)", flexShrink:0 }}>
      {initials(name)}
    </div>
  );
}

function PlayingCard({ rank, suit, size="md" }) {
  const red = suit==="H"||suit==="D";
  const s = {sm:{w:30,h:42,fr:11,fs:13},md:{w:46,h:64,fr:16,fs:19},lg:{w:62,h:88,fr:20,fs:24}}[size];
  return (
    <div style={{ width:s.w, height:s.h, borderRadius:5, background:"#faf8f4", border:"1px solid #ccc", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", boxShadow:"0 2px 8px rgba(0,0,0,0.45)", flexShrink:0, gap:1 }}>
      <div style={{ fontSize:s.fr, fontWeight:700, color:red?"#b91c1c":"#111", lineHeight:1, fontFamily:FD }}>{rank}</div>
      <div style={{ fontSize:s.fs, color:red?"#b91c1c":"#111", lineHeight:1 }}>{SUIT_SYMBOLS[suit]}</div>
    </div>
  );
}

function CardBack({ size="md" }) {
  const s = {sm:{w:30,h:42},md:{w:46,h:64},lg:{w:62,h:88}}[size];
  return <div style={{ width:s.w, height:s.h, borderRadius:5, background:"repeating-linear-gradient(45deg,#3d0a0a,#3d0a0a 4px,#2a0707 4px,#2a0707 8px)", border:"1px solid #5a1515", boxShadow:"0 2px 8px rgba(0,0,0,0.5)", flexShrink:0 }} />;
}

function ChipCounter({ value, onChange }) {
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:12 }}>
      {Object.entries(CHIPS).map(([color,info]) => (
        <div key={color} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:info.hex, border:`3px dashed rgba(255,255,255,0.3)`, boxShadow:"0 2px 8px rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:9, color:color==="white"?"#333":"#fff", fontWeight:700, fontFamily:FU }}>{info.v}</span>
          </div>
          <input type="number" min="0" value={value[color]||0} onChange={e=>onChange({...value,[color]:+e.target.value})}
            style={{ width:48, textAlign:"center", padding:"3px 4px", borderRadius:4, border:"1px solid #3d1515", background:"#0c0707", color:"#ede5d8", fontSize:16, fontFamily:FD, outline:"none" }} />
          <span style={{ fontSize:9, color:"#6a5040", fontFamily:FU }}>{info.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── NAME GATE ────────────────────────────────────────────────────────────────
function NameGate({ onDone }) {
  const [name, setName] = useState("");
  const submit = () => { if(!name.trim()) return; localStorage.setItem("pk_name",name.trim()); onDone(name.trim()); };
  return (
    <div style={{ minHeight:"100vh", background:"#0a0707", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FU }}>
      <div style={{ textAlign:"center", padding:40 }}>
        <div style={{ fontSize:48, marginBottom:8 }}>♠</div>
        <h1 style={{ fontFamily:FD, color:"#c9a84c", fontSize:32, margin:"0 0 6px", fontWeight:700 }}>Sushmit's Poker Club</h1>
        <p style={{ color:"#6a5040", marginBottom:32, fontSize:14 }}>What's your name at this table?</p>
        <div style={{ display:"flex", gap:8, maxWidth:320, margin:"0 auto" }}>
          <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Your name…" style={{ ...IS, flex:1, textAlign:"center", fontSize:16 }} autoFocus />
          <button onClick={submit} style={btn("gold","md")}>Enter →</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [myName, setMyName] = useState(MY_NAME);
  if (!myName) return <NameGate onDone={n=>{MY_NAME=n;setMyName(n);}} />;
  return <PokerApp myName={myName} />;
}

function PokerApp({ myName }) {
  const [page, setPage]           = useState("home");
  const [activeId, setActiveId]   = useState(null);
  const [players, setPlayers]     = useState({});
  const [sessions, setSessions]   = useState({});
  const [leaderboard, setLB]      = useState({});
  const [dealerHands, setDH]      = useState({});

  useEffect(() => {
    const offs = [
      DB.onPlayers(setPlayers),
      DB.onSessions(setSessions),
      DB.onLeaderboard(setLB),
      DB.onDealerHands(setDH),
    ];
    return () => offs.forEach(f=>f());
  }, []);

  const nav = key => { setPage(key); setActiveId(null); };
  const navSession = id => { setActiveId(id); setPage("session"); };

  const session = activeId ? sessions[activeId] : null;

  const navItems = [
    {key:"home",        icon:"♠", label:"Sessions"},
    {key:"players",     icon:"♣", label:"Players"},
    {key:"leaderboard", icon:"♦", label:"Leaderboard"},
    {key:"dealer",      icon:"♥", label:"The Dealer"},
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#0a0707", color:"#ede5d8", fontFamily:FU }}>
      <style>{`
        *{box-sizing:border-box;} input[type=number]::-webkit-inner-spin-button{opacity:0.4}
        select option{background:#110b0b;color:#ede5d8;}
        input::placeholder,textarea::placeholder{color:#4a3020;}
        ::selection{background:#c9a84c33;}
        scrollbar-width:thin; scrollbar-color:#3d1515 #0a0707;
        ::-webkit-scrollbar{width:5px;} ::-webkit-scrollbar-track{background:#0a0707;}
        ::-webkit-scrollbar-thumb{background:#3d1515;border-radius:3px;}
      `}</style>

      <div style={{ position:"fixed", inset:0, background:"radial-gradient(ellipse 80% 50% at 50% -10%,#1e0808,#0a0707)", pointerEvents:"none", zIndex:0 }} />
      <div style={{ position:"fixed", inset:0, backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='none'/%3E%3Ccircle cx='1' cy='1' r='0.5' fill='rgba(255,255,255,0.015)'/%3E%3C/svg%3E\")", pointerEvents:"none", zIndex:0 }} />

      <nav style={{ position:"sticky", top:0, zIndex:100, background:"rgba(10,7,7,0.95)", borderBottom:"1px solid #2e1010", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", backdropFilter:"blur(16px)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"13px 0" }}>
          <span style={{ fontSize:20, color:"#c9a84c" }}>♠</span>
          <span style={{ fontSize:14, fontWeight:600, letterSpacing:"0.18em", color:"#c9a84c", fontFamily:FD, fontSize:16 }}>SUSHMIT'S POKER CLUB</span>
        </div>
        <div style={{ display:"flex", gap:1, alignItems:"center" }}>
          {navItems.map(n=>(
            <button key={n.key} onClick={()=>nav(n.key)} style={{ padding:"8px 14px", borderRadius:6, border:"none", background:page===n.key?"rgba(201,168,76,0.15)":"transparent", color:page===n.key?"#c9a84c":"#6a5040", fontWeight:page===n.key?500:400, cursor:"pointer", fontSize:13, fontFamily:FU, transition:"all 0.2s", borderBottom:page===n.key?"2px solid #c9a84c":"2px solid transparent" }}>
              <span style={{ marginRight:5, fontSize:10 }}>{n.icon}</span>{n.label}
            </button>
          ))}
          <div style={{ marginLeft:16, padding:"5px 12px", background:"#1e0d0d", borderRadius:20, border:"1px solid #3d1515", fontSize:12, color:"#8a7060", fontFamily:FU }}>
            {initials(myName)} {myName.split(" ")[0]}
          </div>
        </div>
      </nav>

      <div style={{ position:"relative", zIndex:1, maxWidth:1000, margin:"0 auto", padding:"30px 18px" }}>
        {page==="home"        && !activeId && <SessionsPage   players={players} sessions={sessions} onNav={navSession} myName={myName} />}
        {page==="session"     && session   && <SessionPage    id={activeId} session={session} players={players} myName={myName} onBack={()=>nav("home")} sessions={sessions} leaderboard={leaderboard} />}
        {page==="players"                  && <PlayersPage    players={players} leaderboard={leaderboard} />}
        {page==="leaderboard"              && <LeaderboardPage leaderboard={leaderboard} sessions={sessions} />}
        {page==="dealer"                   && <DealerPage     dealerHands={dealerHands} players={players} />}
      </div>
    </div>
  );
}

// ─── SESSIONS PAGE ────────────────────────────────────────────────────────────
function SessionsPage({ players, sessions, onNav, myName }) {
  const [showNew, setShowNew] = useState(false);
  const [name,    setName]    = useState("");
  const [buyIn,   setBuyIn]   = useState(20);
  const [ratio,   setRatio]   = useState(15);
  const [sel,     setSel]     = useState([]);

  const toggle = id => setSel(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  const create = async () => {
    if (!name.trim()) return;
    const pArr = Object.entries(players)
      .filter(([id])=>sel.includes(id))
      .map(([id,p])=>({ id:uid(), playerId:id, name:p.name, buyIn, chips:buyIn*ratio, loans:0, cashout:null, cashoutChips:null }));
    const s = { name:name.trim(), date:Date.now(), buyIn, chipRatio:ratio, players:pArr, closed:false, createdBy:myName };
    await DB.createSession(s);
    setShowNew(false); setName(""); setBuyIn(20); setRatio(15); setSel([]);
  };

  const sorted = Object.entries(sessions).sort((a,b)=>b[1].date-a[1].date);

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
        <h1 style={{ fontSize:30, color:"#c9a84c", margin:0, fontFamily:FD, fontWeight:700 }}>Sessions</h1>
        <button onClick={()=>setShowNew(true)} style={btn("gold")}>+ New Session</button>
      </div>

      {showNew && (
        <Panel style={{ marginBottom:24 }}>
          <h2 style={{ color:"#c9a84c", fontSize:18, margin:"0 0 20px", fontFamily:FD }}>New Session</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <label style={LS}>Session name
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Friday Night…" style={IS} />
            </label>
            <div style={{ display:"flex", gap:12 }}>
              <label style={LS}>Default buy-in (₹)
                <input type="number" value={buyIn} onChange={e=>setBuyIn(+e.target.value)} style={IS} />
              </label>
              <label style={LS}>Chips per ₹1
                <input type="number" value={ratio} onChange={e=>setRatio(+e.target.value)} style={IS} />
              </label>
            </div>
            <div style={{ fontSize:13, color:"#6a5040", fontFamily:FU }}>
              ₹<span style={{ fontFamily:FD, color:"#c9a84c", fontSize:16 }}>{buyIn}</span> buy-in → <span style={{ fontFamily:FD, color:"#c9a84c", fontSize:16 }}>{buyIn*ratio}</span> chips
            </div>
            <div>
              <div style={{ fontSize:11, color:"#8a7060", fontFamily:FU, fontWeight:500, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:10 }}>Select Players</div>
              {Object.keys(players).length===0
                ? <p style={{ color:"#4a3020", fontStyle:"italic", fontFamily:FD }}>No players in directory — add them in the Players tab first.</p>
                : <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {Object.entries(players).map(([id,p])=>{
                      const on = sel.includes(id);
                      return (
                        <button key={id} onClick={()=>toggle(id)} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 13px", borderRadius:20, border:`1px solid ${on?"#c9a84c":"#2e1010"}`, background:on?"rgba(201,168,76,0.1)":"transparent", color:on?"#c9a84c":"#7a6050", cursor:"pointer", fontFamily:FU, fontSize:13, transition:"all 0.15s" }}>
                          <Avatar name={p.name} size={20} />
                          {p.nick||p.name}
                          {on&&<span style={{fontSize:10}}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
              }
              {sel.length>0 && <div style={{ marginTop:10, fontSize:12, color:"#6a5040" }}>{sel.length} players · Pot: <span style={{ fontFamily:FD, color:"#c9a84c" }}>{rs(buyIn*sel.length)}</span></div>}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={create} style={btn("gold")} disabled={!name.trim()}>Create</button>
              <button onClick={()=>setShowNew(false)} style={btn("ghost")}>Cancel</button>
            </div>
          </div>
        </Panel>
      )}

      {sorted.length===0 && <div style={{ textAlign:"center", color:"#4a3020", padding:"60px 0", fontFamily:FD, fontStyle:"italic", fontSize:18 }}>No sessions yet. Deal 'em in. ♠</div>}

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {sorted.map(([id,s])=>(
          <Panel key={id} onClick={()=>onNav(id)} style={{ cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:600, color:"#ede5d8", fontFamily:FD }}>{s.name}</div>
                <div style={{ fontSize:12, color:"#4a3020", marginTop:3, fontFamily:FU }}>
                  {new Date(s.date).toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
                  {s.createdBy && <span style={{ color:"#6a5040" }}> · by {s.createdBy}</span>}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ display:"flex" }}>
                  {(s.players||[]).slice(0,5).map((p,i)=>(
                    <div key={i} style={{ marginLeft:i>0?-8:0, zIndex:5-i }}>
                      <Avatar name={p.name} size={26} />
                    </div>
                  ))}
                  {(s.players||[]).length>5 && <span style={{ fontSize:11, color:"#6a5040", marginLeft:6 }}>+{s.players.length-5}</span>}
                </div>
                <div style={{ fontSize:12, color:"#6a5040" }}>₹{s.buyIn} buy-in</div>
                <span style={{ padding:"4px 10px", borderRadius:12, fontSize:11, fontWeight:600, background:s.closed?"#14532d":"#4a0c0c", color:s.closed?"#86efac":"#fca5a5" }}>
                  {s.closed?"CLOSED":"LIVE"}
                </span>
                <span style={{ color:"#c9a84c" }}>→</span>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

// ─── SESSION PAGE ─────────────────────────────────────────────────────────────
function SessionPage({ id, session, players, myName, onBack, leaderboard }) {
  const [lock,       setLock]    = useState(null);
  const [myLock,     setMyLock]  = useState(false);
  const [showCashout,setCO]      = useState(null);
  const [showLoan,   setSL]      = useState(null);
  const [showAdd,    setAdd]     = useState(false);
  const [addBuyIn,   setABI]     = useState(session.buyIn);
  const [showReceipt,setReceipt] = useState(false);
  const lockInterval = useRef(null);

  useEffect(()=>{
    const off = DB.onLock(id, setLock);
    return ()=>{ off(); if(myLock){ DB.releaseLock(id,MY_ID); clearInterval(lockInterval.current); } };
  },[id]);

  const acquireLock = async () => {
    const r = await DB.acquireLock(id, MY_ID, myName);
    if(r.ok){
      setMyLock(true);
      lockInterval.current = setInterval(()=>DB.refreshLock(id,MY_ID),10000);
    } else {
      alert(`${r.heldBy} is currently editing this session. Wait for them to finish.`);
    }
  };
  const releaseLock = () => {
    DB.releaseLock(id,MY_ID); setMyLock(false); clearInterval(lockInterval.current);
  };

  const iAmEditor = myLock && lock?.userId===MY_ID;
  const lockedByOther = lock && lock.userId!==MY_ID && Date.now()-lock.ts<30000;

  const updateSession = (patch) => DB.updateSession(id, patch);
  const updatePlayers = (newPlayers) => DB.updateSession(id, { players:newPlayers });

  const addDirectoryPlayer = async (dp) => {
    if (!iAmEditor) return;
    const np = { id:uid(), playerId:dp.id, name:dp.name, buyIn:addBuyIn, chips:addBuyIn*session.chipRatio, loans:0, cashout:null, cashoutChips:null };
    await updatePlayers([...(session.players||[]), np]);
    setAdd(false);
  };

  const closeSession = async () => {
    if (!iAmEditor) return;
    if (!(session.players||[]).every(p=>p.cashout!==null)) { alert("All players must cash out first."); return; }
    const entries = (session.players||[]).map(p=>({ id:uid(), name:p.name, net:Math.round(pnl(p)), sessionName:session.name, date:session.date }));
    await DB.appendLeaderboard(entries);
    await updateSession({ closed:true });
    releaseLock();
    setReceipt(true);
  };

  const totalPot = (session.players||[]).reduce((s,p)=>s+p.buyIn+(p.loans||0),0);
  const available = Object.entries(players).filter(([pid])=>!(session.players||[]).find(sp=>sp.playerId===pid));

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:24 }}>
        <button onClick={onBack} style={btn("ghost")}>← Back</button>
        <div style={{ flex:1 }}>
          <h1 style={{ fontSize:26, color:"#c9a84c", margin:0, fontFamily:FD, fontWeight:700 }}>{session.name}</h1>
          <div style={{ fontSize:12, color:"#4a3020", fontFamily:FU, marginTop:2 }}>
            Buy-in ₹{session.buyIn} · {session.chipRatio} chips/₹ · Total pot {rs(totalPot)}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
          {!session.closed && (
            iAmEditor
              ? <>
                  <button onClick={releaseLock} style={btn("ghost")}>🔓 Release Edit</button>
                  <button onClick={closeSession} style={btn("danger")}>Close Session</button>
                </>
              : <button onClick={acquireLock} style={btn(lockedByOther?"ghost":"gold")} disabled={!!lockedByOther}>
                  {lockedByOther ? `🔒 ${lock.userName} editing…` : "✏️ Take Edit"}
                </button>
          )}
          {session.closed && <button onClick={()=>setReceipt(true)} style={btn("gold")}>🧾 Settlement</button>}
        </div>
      </div>

      {/* Lock status bar */}
      {lockedByOther && (
        <div style={{ background:"#2a1008", border:"1px solid #7c2d12", borderRadius:8, padding:"10px 16px", marginBottom:16, fontSize:13, color:"#fca5a5", fontFamily:FU }}>
          👁 Viewing live — <strong>{lock.userName}</strong> has the edit lock. You can see all changes in real time.
        </div>
      )}
      {iAmEditor && (
        <div style={{ background:"#0a2010", border:"1px solid #166534", borderRadius:8, padding:"10px 16px", marginBottom:16, fontSize:13, color:"#86efac", fontFamily:FU }}>
          ✏️ You have the edit lock. Other players can see your changes live.
        </div>
      )}

      {/* Add player */}
      {!session.closed && iAmEditor && (
        <Panel style={{ marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, color:"#8a7060", fontFamily:FU }}>Add player to session</span>
            <button onClick={()=>setAdd(!showAdd)} style={btn("ghost","sm")}>{showAdd?"Cancel":"+ Add Player"}</button>
          </div>
          {showAdd && (
            <div style={{ marginTop:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <span style={{ fontSize:13, color:"#6a5040", fontFamily:FU }}>Buy-in ₹</span>
                <input type="number" value={addBuyIn} onChange={e=>setABI(+e.target.value)} style={{ ...IS, width:100 }} />
                <span style={{ fontSize:12, color:"#4a3020" }}>= {addBuyIn*session.chipRatio} chips</span>
              </div>
              {available.length===0
                ? <p style={{ color:"#4a3020", fontStyle:"italic", fontFamily:FD, margin:0 }}>All registered players are in this session.</p>
                : <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {available.map(([pid,p])=>(
                      <button key={pid} onClick={()=>addDirectoryPlayer({id:pid,...p})} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 13px", borderRadius:20, border:"1px solid #2e1010", background:"transparent", color:"#7a6050", cursor:"pointer", fontFamily:FU, fontSize:13 }}>
                        <Avatar name={p.name} size={20} /> {p.nick||p.name}
                      </button>
                    ))}
                  </div>
              }
            </div>
          )}
        </Panel>
      )}

      {/* Player list */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {(session.players||[]).map(player=>(
          <PlayerRow key={player.id} player={player} session={session} canEdit={iAmEditor}
            showCashout={showCashout===player.id} showLoan={showLoan===player.id}
            onCashout={()=>setCO(showCashout===player.id?null:player.id)}
            onLoan={()=>setSL(showLoan===player.id?null:player.id)}
            onClose={()=>{setCO(null);setSL(null);}}
            onUpdate={newPlayer=>{
              const newPlayers=(session.players||[]).map(p=>p.id===newPlayer.id?newPlayer:p);
              updatePlayers(newPlayers);
            }}
          />
        ))}
      </div>

      {/* Settlement receipt modal */}
      {showReceipt && (
        <SettlementModal session={session} onClose={()=>setReceipt(false)} />
      )}
    </div>
  );
}

function PlayerRow({ player, session, canEdit, showCashout, showLoan, onCashout, onLoan, onClose, onUpdate }) {
  const [loanAmt,  setLoanAmt]  = useState(100);
  const [loanType, setLoanType] = useState("chips");
  const [cashChips,setCashChips]= useState({});
  const [manual,   setManual]   = useState("");
  const [mode,     setMode]     = useState("manual");

  const applyLoan = () => {
    const chipVal = loanType==="chips" ? loanAmt : loanAmt*session.chipRatio;
    const rsVal   = loanType==="rs"    ? loanAmt : loanAmt/session.chipRatio;
    onUpdate({...player, loans:(player.loans||0)+rsVal, chips:(player.chips||0)+chipVal});
    onClose();
  };

  const applyCashout = () => {
    const total = mode==="manual" ? +manual : chipSum(cashChips);
    onUpdate({...player, cashout:total/session.chipRatio, cashoutChips:total});
    onClose();
  };

  const net = player.cashout!==null ? pnl(player) : null;

  return (
    <Panel>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Avatar name={player.name} size={40} />
          <div>
            <div style={{ fontSize:16, fontWeight:600, fontFamily:FD, color:"#ede5d8" }}>{player.name}</div>
            <div style={{ fontSize:11, color:"#6a5040", fontFamily:FU }}>
              Buy-in {rs(player.buyIn)} · {player.buyIn*session.chipRatio} chips
              {(player.loans||0)>0 && <span style={{ color:"#fca5a5" }}> · Loan {rs(player.loans)}</span>}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {player.cashout!==null ? (
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:12, color:"#6a5040", fontFamily:FU }}>Out: {player.cashoutChips} chips → {rs(player.cashout)}</div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily:FD, color:net>=0?"#6ee7b7":"#f87171" }}>{net>=0?"+":""}{rs(net)}</div>
            </div>
          ) : canEdit && !session.closed && (
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={onLoan}    style={btn("ghost","sm")}>+ Loan</button>
              <button onClick={onCashout} style={btn("gold","sm")}>Cash Out</button>
            </div>
          )}
          {player.cashout===null && !canEdit && <span style={{ fontSize:12, color:"#4a3020", fontFamily:FU }}>Waiting…</span>}
        </div>
      </div>

      {showLoan && canEdit && (
        <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid #1e0808" }}>
          <div style={{ fontSize:11, color:"#c9a84c", marginBottom:10, fontFamily:FU, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.07em" }}>Add Loan</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <select value={loanType} onChange={e=>setLoanType(e.target.value)} style={{ ...IS, width:110 }}>
              <option value="chips">Chips</option>
              <option value="rs">₹ Rupees</option>
            </select>
            <input type="number" value={loanAmt} onChange={e=>setLoanAmt(+e.target.value)} style={{ ...IS, width:120 }} />
            <span style={{ fontSize:13, color:"#4a3020", fontFamily:FU }}>
              {loanType==="chips"?`= ₹${(loanAmt/session.chipRatio).toFixed(2)}`:`= ${(loanAmt*session.chipRatio).toFixed(0)} chips`}
            </span>
            <button onClick={applyLoan} style={btn("gold","sm")}>Apply</button>
          </div>
        </div>
      )}

      {showCashout && canEdit && (
        <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid #1e0808" }}>
          <div style={{ fontSize:11, color:"#c9a84c", marginBottom:10, fontFamily:FU, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.07em" }}>Cash Out</div>
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            {[["manual","✏️ Manual"],["chips","🎰 By Color"]].map(([m,lbl])=>(
              <button key={m} onClick={()=>setMode(m)} style={btn(mode===m?"gold":"ghost","sm")}>{lbl}</button>
            ))}
          </div>
          {mode==="manual"
            ? <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input type="number" value={manual} onChange={e=>setManual(e.target.value)} placeholder="Total chips" style={{ ...IS, width:160 }} />
                {manual && <span style={{ fontSize:16, color:"#8a7060", fontFamily:FD }}>= {rs(manual/session.chipRatio)}</span>}
              </div>
            : <div>
                <ChipCounter value={cashChips} onChange={setCashChips} />
                <div style={{ marginTop:10, fontSize:16, color:"#c9a84c", fontFamily:FD }}>
                  {chipSum(cashChips)} chips = {rs(chipSum(cashChips)/session.chipRatio)}
                </div>
              </div>
          }
          <button onClick={applyCashout} style={{ ...btn("gold"), marginTop:14 }} disabled={mode==="manual"?!manual:chipSum(cashChips)===0}>
            Confirm Cashout
          </button>
        </div>
      )}
    </Panel>
  );
}

// ─── SETTLEMENT MODAL ─────────────────────────────────────────────────────────
function SettlementModal({ session, onClose }) {
  const players = (session.players||[]).filter(p=>p.cashout!==null);
  const txns    = settle(players);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20, backdropFilter:"blur(8px)" }}>
      <div style={{ background:"#110b0b", border:"1px solid #c9a84c", borderRadius:16, maxWidth:560, width:"100%", maxHeight:"90vh", overflow:"auto", padding:28, position:"relative" }}>
        <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", color:"#6a5040", fontSize:20, cursor:"pointer" }}>×</button>

        <h2 style={{ fontFamily:FD, color:"#c9a84c", fontSize:24, margin:"0 0 4px" }}>Settlement Receipt</h2>
        <p style={{ color:"#6a5040", fontSize:13, margin:"0 0 24px", fontFamily:FU }}>{session.name} · {new Date(session.date).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</p>

        {/* Results table */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, color:"#6a5040", fontFamily:FU, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>Final P&L</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {players.sort((a,b)=>pnl(b)-pnl(a)).map(p=>{
              const n = Math.round(pnl(p));
              return (
                <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:8, background:"rgba(255,255,255,0.02)", border:"1px solid #1e0808" }}>
                  <Avatar name={p.name} size={30} />
                  <span style={{ flex:1, fontFamily:FD, fontSize:15, color:"#ede5d8" }}>{p.name}</span>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:18, fontWeight:700, fontFamily:FD, color:n>=0?"#6ee7b7":"#f87171" }}>{n>=0?"+":""}{rs(n)}</div>
                    <div style={{ fontSize:10, color:"#4a3020", fontFamily:FU }}>
                      Out: {p.cashoutChips}ch = {rs(p.cashout)} · Loans: {rs(p.loans||0)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transactions */}
        <div>
          <div style={{ fontSize:11, color:"#6a5040", fontFamily:FU, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>
            Who Pays Whom — {txns.length} transfer{txns.length!==1?"s":""}
          </div>
          {txns.length===0
            ? <p style={{ color:"#4a3020", fontFamily:FD, fontStyle:"italic" }}>Everyone is square. No transfers needed.</p>
            : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {txns.map((t,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderRadius:10, background:"#0c0707", border:"1px solid #2e1010" }}>
                    <Avatar name={t.from} size={32} />
                    <div style={{ flex:1 }}>
                      <span style={{ fontFamily:FD, fontSize:15, color:"#f87171" }}>{t.from}</span>
                      <span style={{ color:"#4a3020", fontSize:13, fontFamily:FU, margin:"0 8px" }}>pays</span>
                      <span style={{ fontFamily:FD, fontSize:15, color:"#6ee7b7" }}>{t.to}</span>
                    </div>
                    <Avatar name={t.to} size={32} />
                    <div style={{ fontSize:22, fontWeight:700, fontFamily:FD, color:"#c9a84c", minWidth:80, textAlign:"right" }}>{rs(t.amount)}</div>
                  </div>
                ))}
              </div>
          }
        </div>

        <div style={{ marginTop:24, paddingTop:16, borderTop:"1px solid #1e0808", fontSize:11, color:"#4a3020", fontFamily:FU, textAlign:"center" }}>
          Total pot: {rs((session.players||[]).reduce((s,p)=>s+p.buyIn+(p.loans||0),0))} · {players.length} players
        </div>
      </div>
    </div>
  );
}

// ─── PLAYERS PAGE ─────────────────────────────────────────────────────────────
function PlayersPage({ players, leaderboard }) {
  const [name,setName] = useState("");
  const [nick,setNick] = useState("");

  const add = async () => {
    if(!name.trim()) return;
    await DB.addPlayer({ name:name.trim(), nick:nick.trim(), joined:Date.now() });
    setName(""); setNick("");
  };
  const remove = id => { if(confirm("Remove player?")) DB.removePlayer(id); };

  const stats = pname => {
    const r = Object.values(leaderboard).filter(x=>x.name===pname);
    return { sessions:r.length, total:Math.round(r.reduce((s,x)=>s+x.net,0)) };
  };

  return (
    <div>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:30, color:"#c9a84c", margin:"0 0 4px", fontFamily:FD, fontWeight:700 }}>Players</h1>
        <p style={{ color:"#6a5040", fontSize:13, margin:0, fontFamily:FU }}>Global directory — shared across all sessions</p>
      </div>

      <Panel style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, color:"#c9a84c", marginBottom:12, fontFamily:FU, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.07em" }}>Register Player</div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Full name" style={{ ...IS, flex:2, minWidth:140 }} />
          <input value={nick} onChange={e=>setNick(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Nickname (optional)" style={{ ...IS, flex:1, minWidth:120 }} />
          <button onClick={add} style={btn("gold")}>+ Add</button>
        </div>
      </Panel>

      {Object.keys(players).length===0 && (
        <div style={{ textAlign:"center", color:"#4a3020", padding:"60px 0", fontFamily:FD, fontStyle:"italic", fontSize:18 }}>No players yet. The table is empty. ♠</div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))", gap:12 }}>
        {Object.entries(players).map(([id,p])=>{
          const s = stats(p.name);
          return (
            <Panel key={id}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                <Avatar name={p.name} size={44} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:17, fontFamily:FD, fontWeight:600, color:"#ede5d8" }}>{p.name}</div>
                  {p.nick && <div style={{ fontSize:12, color:"#6a5040", fontFamily:FU }}>"{p.nick}"</div>}
                </div>
                <button onClick={()=>remove(id)} style={{ background:"none", border:"none", color:"#3d1010", cursor:"pointer", fontSize:18, padding:2 }}>×</button>
              </div>
              <div style={{ borderTop:"1px solid #1e0808", paddingTop:10, display:"flex", gap:20 }}>
                <div>
                  <div style={{ fontSize:10, color:"#6a5040", fontFamily:FU, textTransform:"uppercase", letterSpacing:"0.07em" }}>Sessions</div>
                  <div style={{ fontSize:22, fontFamily:FD, fontWeight:600, color:"#c9a84c" }}>{s.sessions}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#6a5040", fontFamily:FU, textTransform:"uppercase", letterSpacing:"0.07em" }}>Total P&L</div>
                  <div style={{ fontSize:22, fontFamily:FD, fontWeight:600, color:s.total>=0?"#6ee7b7":"#f87171" }}>{s.total>=0?"+":""}{rs(s.total)}</div>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
function LeaderboardPage({ leaderboard, sessions }) {
  const byPlayer = {};
  Object.values(leaderboard).forEach(r=>{
    if(!byPlayer[r.name]) byPlayer[r.name]={name:r.name,results:[]};
    byPlayer[r.name].results.push(r.net);
  });
  const rows = Object.values(byPlayer).map(p=>({
    name:p.name, sessions:p.results.length,
    total:Math.round(p.results.reduce((a,b)=>a+b,0)),
    mean:mean(p.results), variance:variance(p.results),
    best:Math.max(...p.results), worst:Math.min(...p.results),
    last3:p.results.slice(-3),
  })).sort((a,b)=>b.total-a.total);

  const best  = rows.length ? Math.max(...rows.map(r=>r.best))  : 0;
  const worst = rows.length ? Math.min(...rows.map(r=>r.worst)) : 0;

  return (
    <div>
      <h1 style={{ fontSize:30, color:"#c9a84c", marginBottom:26, fontFamily:FD, fontWeight:700 }}>Leaderboard</h1>
      {rows.length===0 && <div style={{ textAlign:"center", color:"#4a3020", padding:"60px 0", fontFamily:FD, fontStyle:"italic", fontSize:18 }}>No data yet. Close a session to see results.</div>}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12, marginBottom:28 }}>
        {[
          ["Profit King",     rows[0]?.name||"—",  rows[0]?rs(rows[0].total):"—"],
          ["Best Single Win", rs(best),             rows.find(r=>r.best===best)?.name||"—"],
          ["Worst Loss",      rs(worst),            rows.find(r=>r.worst===worst)?.name||"—"],
          ["Sessions Played", Object.values(sessions).length, `${Object.values(sessions).filter(s=>s.closed).length} closed`],
        ].map(([label,val,sub])=>(
          <div key={label} style={{ background:"#110b0b", border:"1px solid #2e1010", borderRadius:10, padding:"16px 18px" }}>
            <div style={{ fontSize:10, color:"#4a3020", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.1em", fontFamily:FU }}>{label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:"#c9a84c", fontFamily:FD }}>{val}</div>
            {sub && <div style={{ fontSize:12, color:"#6a5040", fontFamily:FU, marginTop:2 }}>{sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:"1px solid #2e1010" }}>
              {["","Player","Sessions","Total P&L","Best","Worst","Mean","Variance","Last 3"].map(h=>(
                <th key={h} style={{ padding:"10px 12px", color:"#6a5040", textAlign:"left", fontWeight:500, whiteSpace:"nowrap", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:FU }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.name} style={{ borderBottom:"1px solid #160808", background:i%2===0?"rgba(255,255,255,0.015)":"transparent" }}>
                <td style={{ padding:"10px 12px", fontSize:18 }}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":<span style={{ color:"#4a3020", fontFamily:FD }}>{i+1}</span>}</td>
                <td style={{ padding:"10px 12px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <Avatar name={r.name} size={28} />
                    <span style={{ fontFamily:FD, fontWeight:600, fontSize:15 }}>{r.name}</span>
                  </div>
                </td>
                <td style={{ padding:"10px 12px", color:"#6a5040", fontFamily:FD, fontSize:15 }}>{r.sessions}</td>
                <td style={{ padding:"10px 12px", color:r.total>=0?"#6ee7b7":"#f87171", fontFamily:FD, fontSize:16, fontWeight:700 }}>{r.total>=0?"+":""}{rs(r.total)}</td>
                <td style={{ padding:"10px 12px", color:"#6ee7b7", fontFamily:FD, fontSize:15 }}>+{rs(r.best)}</td>
                <td style={{ padding:"10px 12px", color:"#f87171", fontFamily:FD, fontSize:15 }}>{rs(r.worst)}</td>
                <td style={{ padding:"10px 12px", color:"#8a7060", fontFamily:FD, fontSize:15 }}>{rs(Math.round(r.mean))}</td>
                <td style={{ padding:"10px 12px", color:"#8a7060", fontFamily:FD, fontSize:15 }}>{Math.round(r.variance)}</td>
                <td style={{ padding:"10px 12px" }}>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {r.last3.map((v,j)=>(
                      <span key={j} style={{ padding:"2px 8px", borderRadius:4, fontSize:13, fontFamily:FD, background:v>=0?"#14532d":"#4a0c0c", color:v>=0?"#6ee7b7":"#f87171", fontWeight:600 }}>
                        {v>=0?"+":""}{rs(v)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DEALER PAGE ──────────────────────────────────────────────────────────────
function DealerPage({ dealerHands, players }) {
  const [showAdd,setShowAdd]  = useState(false);
  const [hPlayers,setHP]      = useState([{name:"",cards:[{rank:"A",suit:"S"},{rank:"K",suit:"H"}]}]);
  const [board,setBoard]      = useState([{rank:"A",suit:"D"},{rank:"K",suit:"C"},{rank:"Q",suit:"S"},null,null]);
  const [pot,setPot]          = useState("");
  const [result,setResult]    = useState("");
  const [title,setTitle]      = useState("");

  const addHP  = ()    => setHP(p=>[...p,{name:"",cards:[{rank:"A",suit:"S"},{rank:"K",suit:"H"}]}]);
  const remHP  = i     => setHP(p=>p.filter((_,j)=>j!==i));
  const updHP  = (i,f,v)     => setHP(p=>p.map((x,j)=>j===i?{...x,[f]:v}:x));
  const updHPC = (pi,ci,f,v) => setHP(p=>p.map((x,j)=>j===pi?{...x,cards:x.cards.map((c,k)=>k===ci?{...c,[f]:v}:c)}:x));
  const updB   = (i,f,v)     => setBoard(p=>p.map((c,j)=>j===i?(c?{...c,[f]:v}:{rank:"A",suit:"S",[f]:v}):c));
  const togB   = i     => setBoard(p=>p.map((c,j)=>j===i?(c?null:{rank:"A",suit:"S"}):c));

  const save = async () => {
    await DB.addDealerHand({ title, players:hPlayers, board, pot, result, date:Date.now() });
    setShowAdd(false); setTitle(""); setResult(""); setPot("");
    setHP([{name:"",cards:[{rank:"A",suit:"S"},{rank:"K",suit:"H"}]}]);
    setBoard([{rank:"A",suit:"D"},{rank:"K",suit:"C"},{rank:"Q",suit:"S"},null,null]);
  };

  const dirNames = Object.values(players).map(p=>p.name);
  const hands    = Object.entries(dealerHands||{}).sort((a,b)=>b[1].date-a[1].date);

  return (
    <div>
      {/* Bio card */}
      <div style={{ background:"linear-gradient(135deg,#110808,#200d0d)", border:"1px solid #c9a84c", borderRadius:16, padding:30, marginBottom:30, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", right:-10, top:-20, fontSize:120, color:"rgba(201,168,76,0.04)", fontFamily:FD, userSelect:"none" }}>♠</div>
        <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:18 }}>
          <div style={{ width:60, height:60, borderRadius:"50%", background:"linear-gradient(135deg,#c9a84c,#a07030)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontFamily:FD, fontWeight:700, color:"#0a0707", border:"2px solid #a07030" }}>S</div>
          <div>
            <h2 style={{ margin:0, fontSize:26, color:"#c9a84c", fontFamily:FD, fontWeight:700 }}>Sushmit</h2>
            <div style={{ color:"#6a5040", fontSize:11, letterSpacing:"0.2em", fontFamily:FU, textTransform:"uppercase", marginTop:3 }}>The Dealer · The Legend</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:10 }}>
            {"♠♥♦♣".split("").map(s=><span key={s} style={{ fontSize:24, color:"♥♦".includes(s)?"#b91c1c":"#c9a84c", fontFamily:FD }}>{s}</span>)}
          </div>
        </div>
        <p style={{ lineHeight:1.9, color:"#c8b8a4", fontSize:14, margin:0, fontFamily:FU }}>
          They say the deck doesn't lie — but when Sushmit deals, even probability holds its breath. This isn't just a shuffle; it's <em>controlled chaos</em>. Royal flushes on the river, quads cracking boats, backdoor gutshots materialising like prophecy — the kind of hands that defy mathematics and haunt players for years. His dealing conjures sequences that Vegas oddsmakers would call impossible: consecutive four-of-a-kinds, back-to-back full houses, and rivers that flip certain victory into legendary defeat. Every night Sushmit deals is a masterclass in statistical improbability. This isn't luck. This is <strong style={{ color:"#c9a84c", fontFamily:FD }}>art</strong>.
        </p>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ color:"#c9a84c", fontSize:22, margin:0, fontFamily:FD, fontWeight:700 }}>Hands of Destiny</h2>
        <button onClick={()=>setShowAdd(!showAdd)} style={btn("gold")}>+ Record a Hand</button>
      </div>

      {showAdd && (
        <Panel style={{ marginBottom:22 }}>
          <h3 style={{ color:"#c9a84c", margin:"0 0 18px", fontFamily:FD, fontSize:18 }}>New Legendary Hand</h3>
          <label style={LS}>Title / Story
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="The River God Strikes Again…" style={IS} />
          </label>

          <div style={{ marginTop:18, marginBottom:10, color:"#6a5040", fontSize:10, borderBottom:"1px solid #1e0808", paddingBottom:8, fontFamily:FU, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.1em" }}>Hole Cards</div>
          {hPlayers.map((player,pi)=>(
            <div key={pi} style={{ background:"#0c0707", borderRadius:8, padding:12, marginBottom:10 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
                {dirNames.length>0
                  ? <select value={player.name} onChange={e=>updHP(pi,"name",e.target.value)} style={{ ...IS, flex:1 }}>
                      <option value="">Select player…</option>
                      {dirNames.map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                  : <input value={player.name} onChange={e=>updHP(pi,"name",e.target.value)} placeholder={`Player ${pi+1}`} style={{ ...IS, flex:1 }} />
                }
                {hPlayers.length>1 && <button onClick={()=>remHP(pi)} style={{ ...btn("ghost","sm"), color:"#f87171" }}>✕</button>}
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {player.cards.map((card,ci)=>(
                  <div key={ci} style={{ display:"flex", gap:4, alignItems:"center" }}>
                    <select value={card.rank} onChange={e=>updHPC(pi,ci,"rank",e.target.value)} style={{ ...IS, width:56, padding:"4px 8px", fontFamily:FD, fontSize:16 }}>
                      {RANKS.map(r=><option key={r}>{r}</option>)}
                    </select>
                    <select value={card.suit} onChange={e=>updHPC(pi,ci,"suit",e.target.value)} style={{ ...IS, width:56, padding:"4px 8px" }}>
                      {SUITS.map(s=><option key={s} value={s}>{SUIT_SYMBOLS[s]} {s}</option>)}
                    </select>
                    <PlayingCard rank={card.rank} suit={card.suit} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addHP} style={{ ...btn("ghost","sm"), marginBottom:18 }}>+ Add Player</button>

          <div style={{ color:"#6a5040", fontSize:10, borderBottom:"1px solid #1e0808", paddingBottom:8, marginBottom:12, fontFamily:FU, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.1em" }}>Board</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {board.map((card,i)=>(
              <div key={i} style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"center" }}>
                <span style={{ fontSize:9, color:"#4a3020", fontFamily:FU, textTransform:"uppercase", letterSpacing:"0.1em" }}>{i<3?"Flop":i===3?"Turn":"River"}</span>
                {card
                  ? <div>
                      <div style={{ display:"flex", gap:2 }}>
                        <select value={card.rank} onChange={e=>updB(i,"rank",e.target.value)} style={{ ...IS, width:52, padding:"2px 5px", fontSize:14, fontFamily:FD }}>
                          {RANKS.map(r=><option key={r}>{r}</option>)}
                        </select>
                        <select value={card.suit} onChange={e=>updB(i,"suit",e.target.value)} style={{ ...IS, width:50, padding:"2px 5px", fontSize:13 }}>
                          {SUITS.map(s=><option key={s} value={s}>{SUIT_SYMBOLS[s]}</option>)}
                        </select>
                      </div>
                      <div style={{ display:"flex", gap:4, marginTop:5, alignItems:"center" }}>
                        <PlayingCard rank={card.rank} suit={card.suit} size="sm" />
                        <button onClick={()=>togB(i)} style={{ fontSize:11, color:"#4a3020", background:"none", border:"none", cursor:"pointer" }}>✕</button>
                      </div>
                    </div>
                  : <button onClick={()=>togB(i)} style={{ width:30,height:42,borderRadius:5,border:"1px dashed #2e1010",background:"#0c0707",color:"#4a3020",cursor:"pointer",fontSize:16 }}>+</button>
                }
              </div>
            ))}
          </div>

          <div style={{ display:"flex", gap:10, marginTop:18 }}>
            <label style={LS}>Pot
              <input value={pot} onChange={e=>setPot(e.target.value)} placeholder="₹500" style={IS} />
            </label>
            <label style={{ ...LS, flex:2 }}>Result / Notes
              <input value={result} onChange={e=>setResult(e.target.value)} placeholder="River flush cracked the boat…" style={IS} />
            </label>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <button onClick={save} style={btn("gold")} disabled={!title}>Save Hand</button>
            <button onClick={()=>setShowAdd(false)} style={btn("ghost")}>Cancel</button>
          </div>
        </Panel>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        {hands.map(([id,hand])=><HandDisplay key={id} hand={hand} />)}
        {hands.length===0 && <div style={{ textAlign:"center", color:"#4a3020", padding:"40px 0", fontFamily:FD, fontStyle:"italic", fontSize:18 }}>No legendary hands recorded yet. ♠</div>}
      </div>
    </div>
  );
}

function HandDisplay({ hand }) {
  return (
    <div style={{ background:"#110b0b", border:"1px solid #2e1010", borderRadius:12, overflow:"hidden" }}>
      <div style={{ background:"linear-gradient(180deg,#0b4228,#083320)", padding:"22px 22px 18px", borderBottom:"4px solid #6b3a10", position:"relative" }}>
        <div style={{ position:"absolute", inset:6, border:"1.5px solid rgba(255,255,255,0.05)", borderRadius:8, pointerEvents:"none" }} />
        <div style={{ textAlign:"center", marginBottom:18 }}>
          <div style={{ fontSize:9, color:"rgba(255,255,255,0.3)", letterSpacing:"0.2em", marginBottom:8, fontFamily:FU, textTransform:"uppercase" }}>Board</div>
          <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
            {hand.board.map((c,i)=>c?<PlayingCard key={i} rank={c.rank} suit={c.suit} size="md"/>:<CardBack key={i} size="md"/>)}
          </div>
        </div>
        <div style={{ display:"flex", gap:16, flexWrap:"wrap", justifyContent:"center" }}>
          {hand.players.map((p,i)=>(
            <div key={i} style={{ textAlign:"center" }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginBottom:6, fontFamily:FU }}>{p.name||`P${i+1}`}</div>
              <div style={{ display:"flex", gap:4, justifyContent:"center" }}>
                {p.cards.map((c,j)=><PlayingCard key={j} rank={c.rank} suit={c.suit} size="sm"/>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding:"14px 18px" }}>
        <div style={{ fontWeight:700, fontSize:18, color:"#c9a84c", marginBottom:5, fontFamily:FD }}>{hand.title}</div>
        <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
          {hand.pot    && <span style={{ fontSize:13, color:"#6a5040", fontFamily:FU }}>Pot: {hand.pot}</span>}
          {hand.result && <span style={{ fontSize:13, color:"#b8a898", fontFamily:FU, fontStyle:"italic" }}>"{hand.result}"</span>}
          <span style={{ fontSize:11, color:"#4a3020", marginLeft:"auto", fontFamily:FU }}>{new Date(hand.date).toLocaleDateString("en-IN")}</span>
        </div>
      </div>
    </div>
  );
}