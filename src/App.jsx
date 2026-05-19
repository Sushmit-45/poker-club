import { useState, useEffect, useCallback } from "react";

// ─── THEME & GLOBALS ──────────────────────────────────────────────────────────
const SUIT_SYMBOLS = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_OPTIONS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const SUIT_OPTIONS = ["S","H","D","C"];
const CHIP_COLORS = { green: { value: 10, color: "#22c55e", label: "Green" }, red: { value: 5, color: "#ef4444", label: "Red" }, black: { value: 50, color: "#2a2a2a", label: "Black" }, white: { value: 100, color: "#f0ece4", label: "White" }, purple: { value: 25, color: "#7c3aed", label: "Purple" } };

// ─── STORAGE + SYNC ───────────────────────────────────────────────────────────
const STORE_KEY = "poker_app_v3";
const broadcast = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("poker_sync") : null;

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || defaultStore(); } catch { return defaultStore(); }
}
// Debounced, retried remote save queue
let __saveTimer = null;
let __pendingRemote = null;

async function __processRemoteSave() {
  if (!__pendingRemote) return;
  const item = __pendingRemote;
  if (!navigator.onLine) {
    // try again later
    __saveTimer = setTimeout(__processRemoteSave, 3000);
    return;
  }
  try {
    const res = await fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: STORE_KEY, value: item.data })
    });
    if (!res.ok) throw new Error('remote save failed');
    __pendingRemote = null;
  } catch (e) {
    item.attempts = (item.attempts || 0) + 1;
    if (item.attempts < 6) {
      const backoff = Math.min(30000, 1000 * 2 ** item.attempts);
      __saveTimer = setTimeout(__processRemoteSave, backoff);
    }
    // if too many attempts, keep it around for manual retry later
  }
}

function saveStore(data) {
  // Persist locally first for instant UX
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch {}
  broadcast?.postMessage({ type: 'sync', data });

  // Schedule debounced remote save (replace any pending)
  __pendingRemote = { data, attempts: 0 };
  if (__saveTimer) clearTimeout(__saveTimer);
  __saveTimer = setTimeout(__processRemoteSave, 1000);
}

// Retry pending saves when back online or when tab becomes visible
window.addEventListener && window.addEventListener('online', () => { if (!__pendingRemote) return; __processRemoteSave(); });
document.addEventListener && document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && __pendingRemote) __processRemoteSave(); });
function defaultStore() {
  return { sessions: [], leaderboard: [], dealerHands: [], currentSession: null, players: [] };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const rs = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;
const uid = () => Math.random().toString(36).slice(2, 10);
const pnl = (p) => (p.cashout ?? 0) - p.buyIn - (p.loans ?? 0);
const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const variance = (arr) => { if (arr.length < 2) return 0; const m = mean(arr); return mean(arr.map(x => (x - m) ** 2)); };

// ─── CARD COMPONENT ───────────────────────────────────────────────────────────
function Card({ rank, suit, size = "md" }) {
  const isRed = suit === "H" || suit === "D";
  const sizes = { sm: { w: 28, h: 40, fs: 9, sf: 10 }, md: { w: 44, h: 60, fs: 13, sf: 16 }, lg: { w: 64, h: 88, fs: 18, sf: 22 } };
  const s = sizes[size];
  return (
    <div style={{ width: s.w, height: s.h, borderRadius: 4, background: "#fff", border: "1px solid #d1d5db", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", flexShrink: 0 }}>
      <div style={{ fontSize: s.fs, fontWeight: 700, color: isRed ? "#dc2626" : "#111", lineHeight: 1 }}>{rank}</div>
      <div style={{ fontSize: s.sf, color: isRed ? "#dc2626" : "#111", lineHeight: 1 }}>{SUIT_SYMBOLS[suit]}</div>
    </div>
  );
}

function CardBack({ size = "md" }) {
  const sizes = { sm: { w: 28, h: 40 }, md: { w: 44, h: 60 }, lg: { w: 64, h: 88 } };
  const s = sizes[size];
  return <div style={{ width: s.w, height: s.h, borderRadius: 4, background: "linear-gradient(135deg,#4a0e0e,#2d0808)", border: "1px solid #6b1a1a", boxShadow: "0 1px 3px rgba(0,0,0,0.4)", flexShrink: 0 }} />;
}

// ─── CHIP COUNTER ─────────────────────────────────────────────────────────────
function ChipCounter({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {Object.entries(CHIP_COLORS).map(([color, info]) => (
        <div key={color} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: info.color, border: "3px solid rgba(255,255,255,0.3)", boxShadow: "0 2px 4px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 8, color: color === "white" ? "#333" : "#fff", fontWeight: 700 }}>{info.value}</span>
          </div>
          <input type="number" min="0" value={value[color] || 0} onChange={e => onChange({ ...value, [color]: +e.target.value })} style={{ width: 44, textAlign: "center", padding: "2px 4px", borderRadius: 4, border: "1px solid #3d1515", background: "#0f0a0a", color: "#e8e0d8", fontSize: 13 }} />
          <span style={{ fontSize: 10, color: "#9ca3af" }}>{info.label}</span>
        </div>
      ))}
    </div>
  );
}

function chipsTotal(chips) {
  return Object.entries(chips || {}).reduce((sum, [color, count]) => sum + (CHIP_COLORS[color]?.value || 0) * count, 0);
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function PokerApp() {
  const [store, setStore] = useState(loadStore);
  const [page, setPage] = useState("home");
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => {
    if (!broadcast) return;
    const handler = (e) => { if (e.data?.type === "sync") { setStore(e.data.data); } };
    broadcast.addEventListener("message", handler);
    return () => broadcast.removeEventListener("message", handler);
  }, []);

  // Try loading remote store from server (Vercel API -> Supabase). Falls back to localStorage.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/store?key=${encodeURIComponent(STORE_KEY)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (mounted && json?.value) setStore(json.value);
      } catch (e) {
        // ignore - remote not configured or offline
      }
    })();
    return () => { mounted = false; };
  }, []);

  const update = useCallback((fn) => {
    setStore(prev => {
      const next = fn(prev);
      saveStore(next);
      return next;
    });
  }, []);

  const session = store.sessions.find(s => s.id === activeSession);

  const navItems = [
    { key: "home", label: "Sessions", icon: "🃏" },
    { key: "players", label: "Players", icon: "👥" },
    { key: "leaderboard", label: "Leaderboard", icon: "🏆" },
    { key: "dealer", label: "The Dealer", icon: "🎩" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0f0a0a", color: "#e8e0d8", fontFamily: "'Courier New', 'Monaco', 'Menlo', monospace" }}>
      {/* FELT TEXTURE OVERLAY */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(ellipse at 50% 0%, #1a0a0a 0%, #0f0a0a 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(15,10,10,0.95)", borderBottom: "1px solid #3d1515", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(10px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
          <span style={{ fontSize: 22 }}>♠</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2, color: "#c9a84c", textTransform: "uppercase" }}>AllInForBluff</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {navItems.map(n => (
            <button key={n.key} onClick={() => { setPage(n.key); setActiveSession(null); }} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: page === n.key ? "#c9a84c" : "transparent", color: page === n.key ? "#0a0f1a" : "#9ca3af", fontWeight: page === n.key ? 700 : 400, cursor: "pointer", fontSize: 13, transition: "all 0.2s" }}>
              {n.icon} {n.label}
            </button>
          ))}
        </div>
      </nav>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        {page === "home" && !activeSession && <SessionsPage store={store} update={update} setActiveSession={id => { setActiveSession(id); setPage("session"); }} />}
        {page === "session" && session && <SessionPage session={session} store={store} update={update} onBack={() => { setPage("home"); setActiveSession(null); }} />}
        {page === "players" && <PlayersPage store={store} update={update} />}
        {page === "leaderboard" && <LeaderboardPage store={store} />}
        {page === "dealer" && <DealerPage store={store} update={update} />}
      </div>
    </div>
  );
}

// ─── PLAYERS DIRECTORY PAGE ──────────────────────────────────────────────────
function PlayersPage({ store, update }) {
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");

  const addPlayer = () => {
    if (!name.trim()) return;
    const player = { id: uid(), name: name.trim(), joinDate: new Date().toISOString() };
    update(prev => ({ ...prev, players: [player, ...prev.players] }));
    setShowNew(false);
    setName("");
  };

  const deletePlayer = (id) => {
    if (confirm("Are you sure?")) {
      update(prev => ({ ...prev, players: prev.players.filter(p => p.id !== id) }));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, color: "#c9a84c", margin: 0, letterSpacing: 1 }}>👥 Players</h1>
        <button onClick={() => setShowNew(true)} style={btnStyle("gold")}>+ Add Player</button>
      </div>

      {showNew && (
        <Card2 style={{ marginBottom: 24 }}>
          <h2 style={{ color: "#c9a84c", fontSize: 16, margin: "0 0 16px" }}>New Player</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={labelStyle}>Player Name
              <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlayer()} placeholder="Enter player name..." style={inputStyle} />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={addPlayer} style={btnStyle("gold")}>Add</button>
              <button onClick={() => setShowNew(false)} style={btnStyle("ghost")}>Cancel</button>
            </div>
          </div>
        </Card2>
      )}

      {store.players.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: "60px 0", fontSize: 15 }}>No players yet. Build your club! ♠</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {store.players.map(p => (
          <Card2 key={p.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2a0d0d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#c9a84c", border: "2px solid #c9a84c" }}>
                  {p.name[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Added {new Date(p.joinDate).toLocaleDateString("en-IN")}</div>
                </div>
              </div>
              <button onClick={() => deletePlayer(p.id)} style={{ ...btnStyle("ghost", "sm"), color: "#fca5a5" }}>✕ Remove</button>
            </div>
          </Card2>
        ))}
      </div>
    </div>
  );
}

// ─── SESSIONS LIST PAGE ───────────────────────────────────────────────────────
function SessionsPage({ store, update, setActiveSession }) {
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [buyIn, setBuyIn] = useState(20);
  const [ratio, setRatio] = useState(15);

  const createSession = () => {
    if (!name.trim()) return;
    const s = { id: uid(), name: name.trim(), date: new Date().toISOString(), buyIn, chipRatio: ratio, players: [], closed: false };
    update(prev => ({ ...prev, sessions: [s, ...prev.sessions] }));
    setShowNew(false); setName(""); setBuyIn(20); setRatio(15);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, color: "#c9a84c", margin: 0, letterSpacing: 1 }}>♠ Sessions</h1>
        <button onClick={() => setShowNew(true)} style={btnStyle("gold")}>+ New Session</button>
      </div>

      {showNew && (
        <Card2 style={{ marginBottom: 24 }}>
          <h2 style={{ color: "#c9a84c", fontSize: 16, margin: "0 0 16px" }}>New Session</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={labelStyle}>Session Name
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Friday Night..." style={inputStyle} />
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <label style={labelStyle}>Default Buy-In (₹)
                <input type="number" value={buyIn} onChange={e => setBuyIn(+e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>Chip Ratio (₹1 = ? chips)
                <input type="number" value={ratio} onChange={e => setRatio(+e.target.value)} style={inputStyle} />
              </label>
            </div>
            <div style={{ color: "#9ca3af", fontSize: 13 }}>
              ₹{buyIn} buy-in → {buyIn * ratio} chips to start
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={createSession} style={btnStyle("gold")}>Create</button>
              <button onClick={() => setShowNew(false)} style={btnStyle("ghost")}>Cancel</button>
            </div>
          </div>
        </Card2>
      )}

      {store.sessions.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: "60px 0", fontSize: 15 }}>No sessions yet. Deal 'em in! ♠</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {store.sessions.map(s => (
          <Card2 key={s.id} onClick={() => setActiveSession(s.id)} style={{ cursor: "pointer", transition: "border-color 0.2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0e0" }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{new Date(s.date).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: "#9ca3af" }}>{s.players.length} players</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Buy-in: ₹{s.buyIn}</div>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.closed ? "#14532d" : "#7c2d12", color: s.closed ? "#86efac" : "#fca5a5" }}>
                  {s.closed ? "CLOSED" : "LIVE"}
                </span>
                <span style={{ color: "#c9a84c", fontSize: 18 }}>→</span>
              </div>
            </div>
          </Card2>
        ))}
      </div>
    </div>
  );
}

// ─── SESSION DETAIL PAGE ──────────────────────────────────────────────────────
function SessionPage({ session, store, update, onBack }) {
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [newBuyIn, setNewBuyIn] = useState(session.buyIn);
  const [showCashout, setShowCashout] = useState(null);
  const [showLoan, setShowLoan] = useState(null);

  const addPlayer = () => {
    if (!selectedPlayer) return;
    const player = store.players.find(p => p.id === selectedPlayer);
    if (!player) return;
    const newPlayer = { id: uid(), name: player.name, buyIn: newBuyIn, chips: newBuyIn * session.chipRatio, loans: 0, cashout: null, cashoutChips: null };
    update(prev => ({ ...prev, sessions: prev.sessions.map(s => s.id === session.id ? { ...s, players: [...s.players, newPlayer] } : s) }));
    setSelectedPlayer("");
    setNewBuyIn(session.buyIn);
  };

  const closeSession = () => {
    const allCashedOut = session.players.every(p => p.cashout !== null);
    if (!allCashedOut) { alert("All players must cash out before closing."); return; }
    const results = session.players.map(p => ({ name: p.name, net: pnl(p), session: session.name, date: session.date }));
    update(prev => {
      const lb = [...prev.leaderboard, ...results.map(r => ({ ...r, id: uid() }))];
      return { ...prev, sessions: prev.sessions.map(s => s.id === session.id ? { ...s, closed: true } : s), leaderboard: lb };
    });
  };

  const totalPot = session.players.reduce((s, p) => s + p.buyIn + p.loans, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={btnStyle("ghost")}>← Back</button>
        <div>
          <h1 style={{ fontSize: 22, color: "#c9a84c", margin: 0 }}>{session.name}</h1>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Buy-in: ₹{session.buyIn} | Ratio: 1:₹{session.chipRatio} chips | Pot: {rs(totalPot)}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          {!session.closed && <button onClick={closeSession} style={btnStyle("danger")}>Close & Record</button>}
        </div>
      </div>

      {!session.closed && (
        <Card2 style={{ marginBottom: 20 }}>
          <h3 style={{ color: "#c9a84c", margin: "0 0 12px", fontSize: 14 }}>Add Player</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 140 }}>
              <option value="">Select a player...</option>
              {store.players.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>₹</span>
              <input type="number" value={newBuyIn} onChange={e => setNewBuyIn(+e.target.value)} style={{ ...inputStyle, width: 80 }} />
              <span style={{ fontSize: 11, color: "#6b7280" }}>= {newBuyIn * session.chipRatio} chips</span>
            </div>
            <button onClick={addPlayer} style={btnStyle("gold")}>+ Add</button>
          </div>
          {store.players.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#fca5a5" }}>
              No players in directory. Go to the 👥 Players page to add some first.
            </div>
          )}
        </Card2>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {session.players.map(player => (
          <PlayerRow key={player.id} player={player} session={session} update={update} showCashout={showCashout === player.id} showLoan={showLoan === player.id} onCashout={() => setShowCashout(showCashout === player.id ? null : player.id)} onLoan={() => setShowLoan(showLoan === player.id ? null : player.id)} onClosePanels={() => { setShowCashout(null); setShowLoan(null); }} />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ player, session, update, showCashout, showLoan, onCashout, onLoan, onClosePanels }) {
  const [loanAmt, setLoanAmt] = useState(100);
  const [loanType, setLoanType] = useState("chips");
  const [cashChips, setCashChips] = useState({});
  const [manualChips, setManualChips] = useState("");
  const [cashoutMode, setCashoutMode] = useState("manual");

  const applyLoan = () => {
    const chipVal = loanType === "chips" ? loanAmt : loanAmt * session.chipRatio;
    const rsVal = loanType === "rs" ? loanAmt : loanAmt / session.chipRatio;
    update(prev => ({ ...prev, sessions: prev.sessions.map(s => s.id === session.id ? { ...s, players: s.players.map(p => p.id === player.id ? { ...p, loans: p.loans + rsVal, chips: p.chips + chipVal } : p) } : s) }));
    onClosePanels();
  };

  const applyCashout = () => {
    let totalChips = 0;
    if (cashoutMode === "manual") totalChips = +manualChips;
    else totalChips = chipsTotal(cashChips);
    const cashoutRs = totalChips / session.chipRatio;
    update(prev => ({ ...prev, sessions: prev.sessions.map(s => s.id === session.id ? { ...s, players: s.players.map(p => p.id === player.id ? { ...p, cashout: cashoutRs, cashoutChips: totalChips } : p) } : s) }));
    onClosePanels();
  };

  const net = player.cashout !== null ? pnl(player) : null;
  const chipStart = player.buyIn * session.chipRatio;

  return (
    <Card2>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#2a0d0d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#c9a84c", border: "2px solid #c9a84c" }}>
            {player.name[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{player.name}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              Buy-in: {rs(player.buyIn)} | Start: {chipStart} chips
              {player.loans > 0 && <span style={{ color: "#fca5a5" }}> | Loans: {rs(player.loans)}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {player.cashout !== null ? (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>Cashed out: {player.cashoutChips} chips → {rs(player.cashout)}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: net >= 0 ? "#86efac" : "#fca5a5" }}>
                {net >= 0 ? "+" : ""}{rs(net)}
              </div>
            </div>
          ) : (
            !session.closed && <div style={{ display: "flex", gap: 6 }}>
              <button onClick={onLoan} style={btnStyle("ghost", "sm")}>+ Loan</button>
              <button onClick={onCashout} style={btnStyle("gold", "sm")}>Cash Out</button>
            </div>
          )}
        </div>
      </div>

      {showLoan && !session.closed && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #3d1515" }}>
          <div style={{ fontSize: 13, color: "#c9a84c", marginBottom: 8 }}>Add Loan</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={loanType} onChange={e => setLoanType(e.target.value)} style={{ ...inputStyle, width: 100 }}>
              <option value="chips">Chips</option>
              <option value="rs">₹ (Rupees)</option>
            </select>
            <input type="number" value={loanAmt} onChange={e => setLoanAmt(+e.target.value)} style={{ ...inputStyle, width: 100 }} />
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {loanType === "chips" ? `= ₹${(loanAmt / session.chipRatio).toFixed(2)}` : `= ${(loanAmt * session.chipRatio).toFixed(0)} chips`}
            </span>
            <button onClick={applyLoan} style={btnStyle("gold", "sm")}>Apply</button>
          </div>
        </div>
      )}

      {showCashout && !session.closed && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #3d1515" }}>
          <div style={{ fontSize: 13, color: "#c9a84c", marginBottom: 8 }}>Cash Out — Enter chip count</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {["manual", "chips"].map(m => (
              <button key={m} onClick={() => setCashoutMode(m)} style={{ ...btnStyle(cashoutMode === m ? "gold" : "ghost", "sm"), textTransform: "capitalize" }}>{m === "chips" ? "🎰 By Color" : "✏️ Manual"}</button>
            ))}
          </div>
          {cashoutMode === "manual" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" value={manualChips} onChange={e => setManualChips(e.target.value)} placeholder="Total chips" style={{ ...inputStyle, width: 140 }} />
              {manualChips && <span style={{ fontSize: 12, color: "#9ca3af" }}>= {rs(manualChips / session.chipRatio)}</span>}
            </div>
          )}
          {cashoutMode === "chips" && (
            <div>
              <ChipCounter value={cashChips} onChange={setCashChips} />
              <div style={{ marginTop: 8, fontSize: 13, color: "#c9a84c" }}>Total: {chipsTotal(cashChips)} chips = {rs(chipsTotal(cashChips) / session.chipRatio)}</div>
            </div>
          )}
          <button onClick={applyCashout} style={{ ...btnStyle("gold"), marginTop: 12 }}
            disabled={cashoutMode === "manual" ? !manualChips : chipsTotal(cashChips) === 0}>
            Confirm Cashout
          </button>
        </div>
      )}
    </Card2>
  );
}

// ─── LEADERBOARD PAGE ─────────────────────────────────────────────────────────
function LeaderboardPage({ store }) {
  const lb = store.leaderboard;
  const byPlayer = {};
  lb.forEach(r => {
    if (!byPlayer[r.name]) byPlayer[r.name] = { name: r.name, results: [] };
    byPlayer[r.name].results.push(r.net);
  });

  const rows = Object.values(byPlayer).map(p => ({
    name: p.name,
    sessions: p.results.length,
    total: p.results.reduce((a, b) => a + b, 0),
    mean: mean(p.results),
    variance: variance(p.results),
    best: Math.max(...p.results),
    worst: Math.min(...p.results),
    last3: p.results.slice(-3),
  })).sort((a, b) => b.total - a.total);

  const highestProfit = rows.length ? Math.max(...rows.map(r => r.best)) : 0;
  const highestLoss = rows.length ? Math.min(...rows.map(r => r.worst)) : 0;

  return (
    <div>
      <h1 style={{ fontSize: 24, color: "#c9a84c", marginBottom: 24, letterSpacing: 1 }}>🏆 Leaderboard</h1>
      {rows.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: "60px 0" }}>No data yet. Close a session to see results.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "All-Time Profit King", value: rows[0]?.name || "—", sub: rows[0] ? rs(rows[0].total) : "" },
          { label: "Highest Single Win", value: rs(highestProfit), sub: rows.find(r => r.best === highestProfit)?.name || "" },
          { label: "Highest Single Loss", value: rs(highestLoss), sub: rows.find(r => r.worst === highestLoss)?.name || "" },
          { label: "Total Sessions", value: store.sessions.length, sub: `${store.sessions.filter(s => s.closed).length} closed` },
        ].map(stat => (
          <div key={stat.label} style={{ background: "#160d0d", border: "1px solid #3d1515", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{stat.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#c9a84c" }}>{stat.value}</div>
            {stat.sub && <div style={{ fontSize: 12, color: "#9ca3af" }}>{stat.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #3d1515" }}>
              {["Rank", "Player", "Sessions", "Total P&L", "Best", "Worst", "Mean", "Variance", "Last 3"].map(h => (
                <th key={h} style={{ padding: "10px 12px", color: "#c9a84c", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} style={{ borderBottom: "1px solid #111827", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                <td style={{ padding: "10px 12px", color: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : i === 2 ? "#cd7f32" : "#6b7280", fontWeight: 700 }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </td>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{r.sessions}</td>
                <td style={{ padding: "10px 12px", color: r.total >= 0 ? "#86efac" : "#fca5a5", fontWeight: 700 }}>{r.total >= 0 ? "+" : ""}{rs(r.total)}</td>
                <td style={{ padding: "10px 12px", color: "#86efac" }}>+{rs(r.best)}</td>
                <td style={{ padding: "10px 12px", color: "#fca5a5" }}>{rs(r.worst)}</td>
                <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{rs(r.mean.toFixed(0))}</td>
                <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{r.variance.toFixed(0)}</td>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {r.last3.map((v, j) => (
                      <span key={j} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 11, background: v >= 0 ? "#14532d" : "#7c2d12", color: v >= 0 ? "#86efac" : "#fca5a5", fontWeight: 600 }}>
                        {v >= 0 ? "+" : ""}{rs(v)}
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
function DealerPage({ store, update }) {
  const [showAddHand, setShowAddHand] = useState(false);
  const [handPlayers, setHandPlayers] = useState([{ name: "", cards: [{ rank: "A", suit: "S" }, { rank: "K", suit: "H" }] }]);
  const [board, setBoard] = useState([
    { rank: "A", suit: "D" }, { rank: "K", suit: "C" }, { rank: "Q", suit: "S" }, null, null
  ]);
  const [pot, setPot] = useState("");
  const [result, setResult] = useState("");
  const [handTitle, setHandTitle] = useState("");

  const addHandPlayer = () => setHandPlayers(prev => [...prev, { name: "", cards: [{ rank: "A", suit: "S" }, { rank: "K", suit: "H" }] }]);
  const removeHandPlayer = (i) => setHandPlayers(prev => prev.filter((_, j) => j !== i));

  const updateHandPlayer = (i, field, val) => setHandPlayers(prev => prev.map((p, j) => j === i ? { ...p, [field]: val } : p));
  const updateHandPlayerCard = (pi, ci, field, val) => setHandPlayers(prev => prev.map((p, j) => j === pi ? { ...p, cards: p.cards.map((c, k) => k === ci ? { ...c, [field]: val } : c) } : p));
  const updateBoard = (i, field, val) => setBoard(prev => prev.map((c, j) => j === i ? (c ? { ...c, [field]: val } : { rank: "A", suit: "S", [field]: val }) : c));
  const toggleBoard = (i) => setBoard(prev => prev.map((c, j) => j === i ? (c ? null : { rank: "A", suit: "S" }) : c));

  const saveHand = () => {
    const hand = { id: uid(), title: handTitle, players: handPlayers, board, pot, result, date: new Date().toISOString() };
    update(prev => ({ ...prev, dealerHands: [hand, ...(prev.dealerHands || [])] }));
    setShowAddHand(false); setHandTitle(""); setResult(""); setPot("");
    setHandPlayers([{ name: "", cards: [{ rank: "A", suit: "S" }, { rank: "K", suit: "H" }] }]);
    setBoard([{ rank: "A", suit: "D" }, { rank: "K", suit: "C" }, { rank: "Q", suit: "S" }, null, null]);
  };

  return (
    <div>
      {/* Dealer bio */}
      <div style={{ background: "linear-gradient(135deg, #160d0d, #2a0d0d)", border: "1px solid #c9a84c", borderRadius: 16, padding: 28, marginBottom: 28, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, fontSize: 80, opacity: 0.05 }}>🎩</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#c9a84c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#0a0f1a" }}>S</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, color: "#c9a84c", letterSpacing: 1 }}>Sushmit</h2>
            <div style={{ color: "#9ca3af", fontSize: 13, letterSpacing: 2, textTransform: "uppercase" }}>The Dealer · The Legend</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {"♠♥♦♣".split("").map(s => <span key={s} style={{ fontSize: 20, color: "H♥D♦".includes(s) ? "#dc2626" : "#c9a84c" }}>{s}</span>)}
          </div>
        </div>
        <p style={{ lineHeight: 1.8, color: "#d1d5db", fontSize: 14, margin: 0 }}>
          They say the deck doesn't lie — but when Sushmit deals, even probability holds its breath. This isn't just a shuffle; it's <em>controlled chaos</em>. Royal flushes on the river, quads cracking boats, backdoor gutshots materialising like prophecy — the kind of hands that defy mathematics and haunt players for years. His dealing conjures sequences that Vegas oddsmakers would call impossible: consecutive four-of-a-kinds, back-to-back full houses, and rivers that flip certain victory into legendary defeat. Every night Sushmit deals is a masterclass in statistical improbability. This isn't luck. This is <strong style={{ color: "#c9a84c" }}>art</strong>.
        </p>
      </div>

      {/* Legendary Hands */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: "#c9a84c", fontSize: 18, margin: 0 }}>✨ Hands of Destiny</h2>
        <button onClick={() => setShowAddHand(!showAddHand)} style={btnStyle("gold")}>+ Record a Hand</button>
      </div>

      {showAddHand && (
        <Card2 style={{ marginBottom: 20 }}>
          <h3 style={{ color: "#c9a84c", margin: "0 0 16px" }}>New Legendary Hand</h3>
          <label style={labelStyle}>Hand Title / Story
            <input value={handTitle} onChange={e => setHandTitle(e.target.value)} placeholder="The River God Strikes Again..." style={inputStyle} />
          </label>

          <div style={{ marginTop: 16, marginBottom: 8, color: "#9c8a7a", fontSize: 13, borderBottom: "1px solid #3d1515", paddingBottom: 8 }}>Players' Hole Cards</div>
          {handPlayers.map((player, pi) => (
            <div key={pi} style={{ background: "#0f0a0a", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <input value={player.name} onChange={e => updateHandPlayer(pi, "name", e.target.value)} placeholder={`Player ${pi + 1}`} style={{ ...inputStyle, flex: 1 }} />
                {handPlayers.length > 1 && <button onClick={() => removeHandPlayer(pi)} style={{ ...btnStyle("ghost", "sm"), color: "#fca5a5" }}>✕</button>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {player.cards.map((card, ci) => (
                  <div key={ci} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <select value={card.rank} onChange={e => updateHandPlayerCard(pi, ci, "rank", e.target.value)} style={{ ...inputStyle, width: 50, padding: "4px 6px" }}>
                      {RANK_OPTIONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                    <select value={card.suit} onChange={e => updateHandPlayerCard(pi, ci, "suit", e.target.value)} style={{ ...inputStyle, width: 50, padding: "4px 6px" }}>
                      {SUIT_OPTIONS.map(s => <option key={s} value={s}>{SUIT_SYMBOLS[s]} {s}</option>)}
                    </select>
                    <Card rank={card.rank} suit={card.suit} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addHandPlayer} style={{ ...btnStyle("ghost", "sm"), marginBottom: 16 }}>+ Add Player</button>

          <div style={{ color: "#9c8a7a", fontSize: 13, borderBottom: "1px solid #3d1515", paddingBottom: 8, marginBottom: 10 }}>Community Cards (Board)</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {board.map((card, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "#6b7280" }}>{i < 3 ? "Flop" : i === 3 ? "Turn" : "River"}</span>
                {card ? (
                  <div>
                    <div style={{ display: "flex", gap: 2 }}>
                      <select value={card.rank} onChange={e => updateBoard(i, "rank", e.target.value)} style={{ ...inputStyle, width: 48, padding: "2px 4px", fontSize: 12 }}>
                        {RANK_OPTIONS.map(r => <option key={r}>{r}</option>)}
                      </select>
                      <select value={card.suit} onChange={e => updateBoard(i, "suit", e.target.value)} style={{ ...inputStyle, width: 46, padding: "2px 4px", fontSize: 12 }}>
                        {SUIT_OPTIONS.map(s => <option key={s} value={s}>{SUIT_SYMBOLS[s]}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 4, alignItems: "center" }}>
                      <Card rank={card.rank} suit={card.suit} size="sm" />
                      <button onClick={() => toggleBoard(i)} style={{ fontSize: 10, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => toggleBoard(i)} style={{ width: 28, height: 40, borderRadius: 4, border: "1px dashed #374151", background: "#111827", color: "#6b7280", cursor: "pointer", fontSize: 16 }}>+</button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <label style={labelStyle}>Pot Size
              <input value={pot} onChange={e => setPot(e.target.value)} placeholder="₹500" style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, flex: 2 }}>Result / Notes
              <input value={result} onChange={e => setResult(e.target.value)} placeholder="River flush cracked the boat..." style={inputStyle} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={saveHand} style={btnStyle("gold")} disabled={!handTitle}>Save Hand</button>
            <button onClick={() => setShowAddHand(false)} style={btnStyle("ghost")}>Cancel</button>
          </div>
        </Card2>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {(store.dealerHands || []).map(hand => <HandDisplay key={hand.id} hand={hand} />)}
        {(store.dealerHands || []).length === 0 && <div style={{ textAlign: "center", color: "#6b7280", padding: "40px 0" }}>No legendary hands recorded yet. The table awaits. ♠</div>}
      </div>
    </div>
  );
}

function HandDisplay({ hand }) {
  const boardCards = hand.board.filter(Boolean);
  return (
    <div style={{ background: "#160d0d", border: "1px solid #3d1515", borderRadius: 12, overflow: "hidden" }}>
      {/* Table felt */}
      <div style={{ background: "linear-gradient(180deg, #0d4d2f 0%, #0a3d24 100%)", padding: "20px 20px 16px", borderBottom: "4px solid #8b4513", position: "relative" }}>
        <div style={{ position: "absolute", inset: 4, border: "2px solid rgba(255,255,255,0.08)", borderRadius: 8, pointerEvents: "none" }} />
        {/* Board */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }}>Board</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {hand.board.map((card, i) => card ? <Card key={i} rank={card.rank} suit={card.suit} size="md" /> : <CardBack key={i} size="md" />)}
          </div>
        </div>
        {/* Players */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {hand.players.map((p, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>{p.name || `P${i + 1}`}</div>
              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                {p.cards.map((c, j) => <Card key={j} rank={c.rank} suit={c.suit} size="sm" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Info */}
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#c9a84c", marginBottom: 4 }}>{hand.title}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {hand.pot && <span style={{ fontSize: 12, color: "#9ca3af" }}>Pot: {hand.pot}</span>}
          {hand.result && <span style={{ fontSize: 12, color: "#d1d5db", fontStyle: "italic" }}>"{hand.result}"</span>}
          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: "auto" }}>{new Date(hand.date).toLocaleDateString("en-IN")}</span>
        </div>
      </div>
    </div>
  );
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function Card2({ children, style, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={onClick} style={{ background: "#160d0d", border: `1px solid ${hovered && onClick ? "#c9a84c" : "#3d1515"}`, borderRadius: 12, padding: "16px 18px", ...style }}>
      {children}
    </div>
  );
}

const inputStyle = { background: "#0f0a0a", border: "1px solid #3d1515", borderRadius: 6, padding: "8px 10px", color: "#e8e0d8", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" };
const labelStyle = { fontSize: 12, color: "#9c8a7a", display: "flex", flexDirection: "column", gap: 4, flex: 1 };
function btnStyle(type = "gold", size = "md") {
  const base = { cursor: "pointer", borderRadius: 6, fontWeight: 600, border: "none", transition: "all 0.15s", fontFamily: "inherit" };
  const sizes = { sm: { padding: "5px 10px", fontSize: 12 }, md: { padding: "8px 16px", fontSize: 13 } };
  const types = {
    gold: { background: "#c9a84c", color: "#0a0f1a" },
    ghost: { background: "transparent", color: "#9c8a7a", border: "1px solid #3d1515" },
    danger: { background: "#7c2d12", color: "#fca5a5", border: "1px solid #991b1b" },
  };
  return { ...base, ...sizes[size], ...types[type] };
}