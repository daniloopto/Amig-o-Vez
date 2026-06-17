import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import {
  ChevronDown, Users, BarChart3, Bell, Check, X, Play, Plus, Trash2,
  Crown, Clock, Lock, Delete, LogOut, ArrowRight, ChevronLeft, Calendar, Building2, Mail, KeyRound,
} from "lucide-react";

/* ---------- Identidade Óticas Amigão ---------- */
const C = {
  bg: "#0d0d0d", surface: "#1a1a1a", surface2: "#242424", border: "#2e2e2e",
  yellow: "#f5c400", text: "#fafafa", muted: "#8c8c8c", green: "#22c55e", red: "#ef4444",
};

/* ---------- Datas no fuso de Brasília ---------- */
const spDate = (off = 0) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = f.format(new Date()).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + off);
  return dt.toISOString().slice(0, 10);
};
const todayStr = () => spDate(0);
const yesterdayStr = () => spDate(-1);
const br = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
const lojaNum = (id) => Number(String(id).replace(/\D/g, "")) || 0;

/* ============================================================
   APP
   ============================================================ */
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("email", session.user.email).single();
      if (alive) setProfile(data || null);
    })();
    return () => { alive = false; };
  }, [session]);

  const sair = () => supabase.auth.signOut();

  if (loading) return <Splash />;
  if (!session) return <Login />;
  if (!profile) return <Splash texto="Carregando seu acesso…" extra={<button onClick={sair} style={{ color: C.muted, fontSize: 13 }} className="mt-4">Sair</button>} />;
  if (profile.papel === "loja") return <Loja lojaId={profile.loja_id} nome={profile.nome} onLogout={sair} />;
  return <Painel profile={profile} onLogout={sair} />;
}

/* ============================================================
   LOGIN
   ============================================================ */
function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  const entrar = async () => {
    setBusy(true); setErro("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha });
    setBusy(false);
    if (error) setErro("E-mail ou senha incorretos");
  };

  return (
    <Screen>
      <div className="max-w-md w-full mx-auto px-5 pt-16 pb-8">
        <Logo size={56} />
        <div style={{ fontSize: 11, letterSpacing: 2, color: C.muted }} className="mt-5">ÓTICAS AMIGÃO</div>
        <div style={{ fontWeight: 900, fontSize: 28, lineHeight: 1.1 }} className="mb-1">Vez de Atendimento</div>
        <div style={{ color: C.muted, fontSize: 14 }} className="mb-7">Entre com seu e-mail e senha.</div>

        <Label>E-mail</Label>
        <Field icon={Mail}>
          <input value={email} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder="voce@oticasamigao.com"
            onChange={(e) => { setEmail(e.target.value); setErro(""); }} className="flex-1 py-3.5 outline-none bg-transparent" style={{ color: C.text, fontSize: 15 }} />
        </Field>
        <Label>Senha</Label>
        <Field icon={Lock}>
          <input value={senha} type="password" placeholder="••••••••" onChange={(e) => { setSenha(e.target.value); setErro(""); }}
            onKeyDown={(e) => e.key === "Enter" && entrar()} className="flex-1 py-3.5 outline-none bg-transparent" style={{ color: C.text, fontSize: 15 }} />
        </Field>
        <div style={{ height: 18, color: C.red, fontSize: 12, fontWeight: 700 }} className="mb-3 mt-1">{erro}</div>
        <button onClick={entrar} disabled={busy || !email || !senha} className="w-full rounded-2xl py-4 flex items-center justify-center gap-2"
          style={{ background: email && senha ? C.yellow : C.surface2, color: email && senha ? "#000" : C.muted, fontWeight: 900, fontSize: 16 }}>
          {busy ? "Entrando…" : "Entrar"} {!busy && <ArrowRight size={18} />}
        </button>
      </div>
    </Screen>
  );
}

/* ============================================================
   OPERAÇÃO DA LOJA
   ============================================================ */
function Loja({ lojaId, nome, onLogout }) {
  const [tab, setTab] = useState("fila");
  const [vendedores, setVendedores] = useState([]);
  const [atendHoje, setAtendHoje] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [pinAlvo, setPinAlvo] = useState(null);   // { v, acao, vendeu? }
  const [vendeuAlvo, setVendeuAlvo] = useState(null);

  const load = useCallback(async () => {
    const [{ data: v }, { data: a }] = await Promise.all([
      supabase.from("vendedores").select("*").eq("loja_id", lojaId),
      supabase.from("atendimentos").select("vendedor_id,vendeu,dia").eq("loja_id", lojaId).eq("dia", todayStr()),
    ]);
    setVendedores(v || []);
    setAtendHoje(a || []);
  }, [lojaId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  // Tempo real
  useEffect(() => {
    const ch = supabase.channel(`loja-${lojaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendedores", filter: `loja_id=eq.${lojaId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "atendimentos", filter: `loja_id=eq.${lojaId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [lojaId, load]);

  const execPin = async (alvo, pin) => {
    let res;
    if (alvo.acao === "disponivel") res = await supabase.rpc("fn_ficar_disponivel", { p_vendedor: alvo.v.id, p_pin: pin });
    else if (alvo.acao === "iniciar") res = await supabase.rpc("fn_iniciar", { p_vendedor: alvo.v.id, p_pin: pin });
    else res = await supabase.rpc("fn_finalizar", { p_vendedor: alvo.v.id, p_pin: pin, p_vendeu: alvo.vendeu });
    if (res.error) return false;
    await load();
    return true;
  };
  const sair = async (v) => { await supabase.rpc("fn_sair", { p_vendedor: v.id }); load(); };

  const fila = vendedores.filter((v) => v.status === "fila").sort((a, b) => a.ordem - b.ordem);
  const aVez = fila[0], proximos = fila.slice(1);
  const atendendo = vendedores.filter((v) => v.status === "atendimento");

  return (
    <Screen flex>
      <Topbar sub={(nome || "").toUpperCase()} onLogout={onLogout} />
      <main className="flex-1 px-4 pb-28 pt-4 max-w-md w-full mx-auto">
        {tab === "fila" && (
          <Fila aVez={aVez} proximos={proximos} atendendo={atendendo} now={now}
            onIniciar={(v) => setPinAlvo({ v, acao: "iniciar" })}
            onFinalizar={(v) => setVendeuAlvo(v)} />
        )}
        {tab === "indicadores" && (<><Label>Conversão de hoje · {br(todayStr())}</Label><Breakdown vendedores={vendedores} logs={atendHoje} /></>)}
        {tab === "equipe" && (
          <Equipe vendedores={vendedores}
            onDisponivel={(v) => setPinAlvo({ v, acao: "disponivel" })} onSair={sair} />
        )}
      </main>
      <BottomNav tab={tab} setTab={setTab} />

      {pinAlvo && (
        <PinModal
          titulo={pinAlvo.acao === "iniciar" ? "Iniciar atendimento" : pinAlvo.acao === "disponivel" ? "Ficar disponível" : "Finalizar atendimento"}
          nome={pinAlvo.v.nome}
          onSubmit={(pin) => execPin(pinAlvo, pin)}
          onClose={() => setPinAlvo(null)}
        />
      )}

      {vendeuAlvo && (
        <Modal>
          <div style={{ fontSize: 13, color: C.muted }}>Finalizar atendimento de</div>
          <div style={{ fontWeight: 900, fontSize: 22 }} className="mb-1">{vendeuAlvo.nome}</div>
          <div style={{ color: C.muted, fontSize: 14 }} className="mb-5">O cliente fechou compra?</div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => { setPinAlvo({ v: vendeuAlvo, acao: "finalizar", vendeu: false }); setVendeuAlvo(null); }} className="rounded-2xl py-5 flex flex-col items-center gap-1" style={{ background: C.surface2, border: `1px solid ${C.border}` }}><X size={26} color={C.red} /><span style={{ fontWeight: 800 }}>Não vendeu</span></button>
            <button type="button" onClick={() => { setPinAlvo({ v: vendeuAlvo, acao: "finalizar", vendeu: true }); setVendeuAlvo(null); }} className="rounded-2xl py-5 flex flex-col items-center gap-1" style={{ background: C.green }}><Check size={26} color="#06210f" /><span style={{ fontWeight: 900, color: "#06210f" }}>Vendeu!</span></button>
          </div>
          <button type="button" onClick={() => setVendeuAlvo(null)} className="w-full mt-3 py-2" style={{ color: C.muted, fontSize: 13 }}>Cancelar</button>
        </Modal>
      )}
    </Screen>
  );
}

function Fila({ aVez, proximos, atendendo, now, onIniciar, onFinalizar }) {
  return (
    <div className="space-y-6">
      <section>
        <Label>A vez agora</Label>
        {aVez ? (
          <div className="rounded-3xl p-5 relative overflow-hidden" style={{ background: C.yellow, color: "#000" }}>
            <Crown size={120} color="#000" style={{ position: "absolute", right: -20, top: -20, opacity: 0.07 }} />
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>É A VEZ DE</div>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.05 }} className="mb-4">{aVez.nome}</div>
            <button type="button" onClick={() => onIniciar(aVez)} className="w-full rounded-2xl py-4 flex items-center justify-center gap-2" style={{ background: "#000", color: C.yellow }}><Play size={18} fill={C.yellow} /><span style={{ fontWeight: 800, fontSize: 16 }}>Iniciar</span></button>
          </div>
        ) : <Empty>Ninguém disponível. Marque presença na aba Equipe.</Empty>}
      </section>

      {atendendo.length > 0 && (
        <section>
          <Label>Em atendimento · {atendendo.length}</Label>
          <div className="space-y-2">
            {atendendo.map((v) => (
              <div key={v.id} className="rounded-2xl p-4 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div><div style={{ fontWeight: 800, fontSize: 16 }}>{v.nome}</div><div className="flex items-center gap-1" style={{ fontSize: 12, color: C.muted }}><Clock size={12} /> há {v.inicio ? Math.max(0, Math.round((now - new Date(v.inicio).getTime()) / 60000)) : 0} min</div></div>
                <button type="button" onClick={() => onFinalizar(v)} className="rounded-xl px-4 py-2.5" style={{ background: C.yellow, color: "#000", fontWeight: 800, fontSize: 14 }}>Finalizar</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <Label>Na fila · {proximos.length}</Label>
        {proximos.length ? (
          <div className="space-y-2">
            {proximos.map((v, i) => (
              <div key={v.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="grid place-items-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: C.surface2, color: C.muted, fontWeight: 800, fontSize: 14 }}>{i + 2}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }} className="flex-1">{v.nome}</div>
                <button type="button" onClick={() => onIniciar(v)} className="rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.yellow, fontWeight: 800, fontSize: 13 }}><Play size={13} fill={C.yellow} /> Iniciar</button>
              </div>
            ))}
          </div>
        ) : <Empty>Sem mais ninguém aguardando.</Empty>}
      </section>
    </div>
  );
}

function Equipe({ vendedores, onDisponivel, onSair }) {
  const disp = vendedores.filter((v) => v.status !== "fora").length;
  const ordered = [...vendedores].sort((a, b) => (a.status === "fora") - (b.status === "fora") || a.nome.localeCompare(b.nome));
  return (
    <div className="space-y-3">
      <Label>Equipe · {disp} disponíve{disp === 1 ? "l" : "is"}</Label>
      <div className="space-y-2">
        {ordered.map((v) => {
          const fora = v.status === "fora", emAtend = v.status === "atendimento";
          return (
            <div key={v.id} className="rounded-2xl p-3.5 flex items-center justify-between" style={{ background: C.surface, border: `1px solid ${C.border}`, opacity: fora ? 0.6 : 1 }}>
              <div className="flex items-center gap-2.5"><div style={{ fontWeight: 700, fontSize: 15 }}>{v.nome}</div><Chip status={v.status} /></div>
              {fora
                ? <button type="button" onClick={() => onDisponivel(v)} className="rounded-lg px-4 py-2 flex items-center gap-1.5" style={{ background: C.yellow, color: "#000", fontSize: 13, fontWeight: 800 }}><Lock size={13} /> Ficar disponível</button>
                : emAtend
                  ? <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>Em atendimento</span>
                  : <button type="button" onClick={() => onSair(v)} className="rounded-lg px-4 py-2 flex items-center gap-1.5" style={{ background: C.surface2, color: C.muted, fontSize: 13, fontWeight: 700 }}><LogOut size={14} /> Sair da fila</button>}
            </div>
          );
        })}
      </div>
      <div className="rounded-xl p-3 mt-2" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Todo dia começa indisponível. Cada vendedor se marca disponível com o próprio PIN. Cadastro e exclusão ficam na diretoria.</div>
      </div>
    </div>
  );
}

/* ============================================================
   PAINEL (diretoria / supervisão)
   ============================================================ */
function Painel({ profile, onLogout }) {
  const diretor = profile.papel === "diretor";
  const titulo = diretor ? "DIRETORIA · TODAS AS LOJAS" : `SUPERVISÃO · ${(profile.nome || "").toUpperCase()}`;

  const [lojas, setLojas] = useState([]);
  const [mode, setMode] = useState("hoje");
  const [de, setDe] = useState(todayStr());
  const [ate, setAte] = useState(todayStr());
  const [logs, setLogs] = useState([]);         // atendimentos no período (escopo via RLS)
  const [lojaSel, setLojaSel] = useState(null);
  const [sub, setSub] = useState("conversao");
  const [detVend, setDetVend] = useState([]);   // vendedores da loja aberta

  const rng = mode === "hoje" ? [todayStr(), todayStr()] : mode === "ontem" ? [yesterdayStr(), yesterdayStr()] : [de, ate];
  const periodoLabel = mode === "hoje" ? `Hoje · ${br(todayStr())}` : mode === "ontem" ? `Ontem · ${br(yesterdayStr())}` : `${br(de)} a ${br(ate)}`;

  useEffect(() => {
    supabase.from("lojas").select("*").then(({ data }) => setLojas((data || []).sort((a, b) => lojaNum(a.id) - lojaNum(b.id))));
  }, []);

  useEffect(() => {
    supabase.from("atendimentos").select("loja_id,vendedor_id,vendeu,dia").gte("dia", rng[0]).lte("dia", rng[1])
      .then(({ data }) => setLogs(data || []));
  }, [rng[0], rng[1]]);

  useEffect(() => {
    if (!lojaSel) { setDetVend([]); return; }
    supabase.from("vendedores").select("*").eq("loja_id", lojaSel).then(({ data }) => setDetVend(data || []));
  }, [lojaSel]);

  const statsFor = (id) => { const l = logs.filter((x) => x.loja_id === id); const vendas = l.filter((x) => x.vendeu).length; return { logs: l, total: l.length, vendas, conv: l.length ? Math.round((vendas / l.length) * 100) : 0 }; };
  const geral = lojas.reduce((a, l) => { const s = statsFor(l.id); a.total += s.total; a.vendas += s.vendas; return a; }, { total: 0, vendas: 0 });
  const convGeral = geral.total ? Math.round((geral.vendas / geral.total) * 100) : 0;
  const showFilter = lojaSel === null || sub === "conversao";

  const recarregarVend = () => supabase.from("vendedores").select("*").eq("loja_id", lojaSel).then(({ data }) => setDetVend(data || []));
  const cadastrar = async (nome, pin) => { await supabase.rpc("fn_cadastrar_vendedor", { p_loja: lojaSel, p_nome: nome, p_pin: pin }); recarregarVend(); };
  const definirPin = async (id, pin) => { await supabase.rpc("fn_definir_pin", { p_vendedor: id, p_pin: pin }); };
  const excluir = async (id) => { await supabase.from("vendedores").delete().eq("id", id); recarregarVend(); };

  const lojaNome = lojaSel ? (lojas.find((l) => l.id === lojaSel)?.nome || "") : "";

  return (
    <Screen flex>
      <Topbar sub={titulo} onLogout={onLogout} />
      <main className="flex-1 px-4 pb-10 pt-4 max-w-md w-full mx-auto">
        {showFilter && (
          <>
            <div className="flex gap-2 mb-2">
              {[["hoje", "Hoje"], ["ontem", "Ontem"], ["periodo", "Período"]].map(([k, t]) => (
                <button type="button" key={k} onClick={() => setMode(k)} className="flex-1 rounded-xl py-2.5 flex items-center justify-center gap-1.5" style={{ background: mode === k ? C.yellow : C.surface, border: `1px solid ${mode === k ? C.yellow : C.border}`, color: mode === k ? "#000" : C.text, fontWeight: 800, fontSize: 14 }}>{k === "periodo" && <Calendar size={14} />}{t}</button>
              ))}
            </div>
            {mode === "periodo" && (
              <div className="flex items-center gap-2 mb-3">
                <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} className="flex-1 rounded-xl px-3 py-2.5 outline-none" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, colorScheme: "dark" }} />
                <span style={{ color: C.muted, fontSize: 13 }}>até</span>
                <input type="date" value={ate} min={de} max={todayStr()} onChange={(e) => setAte(e.target.value)} className="flex-1 rounded-xl px-3 py-2.5 outline-none" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, colorScheme: "dark" }} />
              </div>
            )}
          </>
        )}

        {lojaSel === null ? (
          <>
            <div className="grid grid-cols-3 gap-2 mt-3 mb-4"><Kpi label="Atendimentos" value={geral.total} /><Kpi label="Vendas" value={geral.vendas} accent /><Kpi label="Conversão" value={`${convGeral}%`} accent /></div>
            <Label>Lojas · {periodoLabel}</Label>
            <div className="space-y-2">
              {lojas.map((l) => { const s = statsFor(l.id); return (
                <button type="button" key={l.id} onClick={() => { setLojaSel(l.id); setSub("conversao"); }} className="w-full rounded-2xl p-4 flex items-center justify-between text-left" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                  <div className="flex items-center gap-3"><div className="grid place-items-center rounded-lg" style={{ width: 38, height: 38, background: C.surface2 }}><Building2 size={18} color={C.yellow} /></div><div><div style={{ fontWeight: 800, fontSize: 15 }}>{l.nome}</div><div style={{ fontSize: 12, color: C.muted }}>{s.vendas} vendas · {s.total} atend.</div></div></div>
                  <div className="flex items-center gap-2"><div style={{ fontWeight: 900, fontSize: 20, color: C.yellow }}>{s.conv}%</div><ChevronDown size={18} color={C.muted} style={{ transform: "rotate(-90deg)" }} /></div>
                </button>
              ); })}
              {lojas.length === 0 && <Empty>Carregando lojas…</Empty>}
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setLojaSel(null)} className="flex items-center gap-1 mb-3" style={{ color: C.yellow, fontSize: 14, fontWeight: 700 }}><ChevronLeft size={18} /> Voltar</button>
            <div style={{ fontWeight: 900, fontSize: 22 }} className="mb-3">{lojaNome}</div>
            {diretor && (
              <div className="flex gap-2 mb-4">
                {[["conversao", "Conversão"], ["vendedores", "Vendedores"]].map(([k, t]) => (
                  <button type="button" key={k} onClick={() => setSub(k)} className="flex-1 rounded-xl py-2.5" style={{ background: sub === k ? C.surface2 : "transparent", border: `1px solid ${sub === k ? C.yellow : C.border}`, color: sub === k ? C.yellow : C.muted, fontWeight: 800, fontSize: 14 }}>{t}</button>
                ))}
              </div>
            )}
            {(!diretor || sub === "conversao")
              ? (<><Label>{periodoLabel}</Label><Breakdown vendedores={detVend} logs={statsFor(lojaSel).logs} /></>)
              : <CadastroVendedores vendedores={detVend} onCadastrar={cadastrar} onExcluir={excluir} onDefinirPin={definirPin} />}
          </>
        )}
      </main>
    </Screen>
  );
}

/* ---------- Conversão (reutilizado) ---------- */
function Breakdown({ vendedores, logs }) {
  const stats = useMemo(() => {
    const map = {};
    vendedores.forEach((v) => (map[v.id] = { nome: v.nome, total: 0, vendas: 0 }));
    logs.forEach((l) => { if (!map[l.vendedor_id]) map[l.vendedor_id] = { nome: "—", total: 0, vendas: 0 }; map[l.vendedor_id].total += 1; if (l.vendeu) map[l.vendedor_id].vendas += 1; });
    return Object.values(map).sort((a, b) => b.vendas - a.vendas || b.total - a.total);
  }, [vendedores, logs]);
  const total = logs.length, vendas = logs.filter((l) => l.vendeu).length;
  const conv = total ? Math.round((vendas / total) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2"><Kpi label="Atendimentos" value={total} /><Kpi label="Vendas" value={vendas} accent /><Kpi label="Conversão" value={`${conv}%`} accent /></div>
      <div className="space-y-2">
        {stats.map((s, i) => { const pct = s.total ? Math.round((s.vendas / s.total) * 100) : 0; return (
          <div key={i} className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-2"><div style={{ fontWeight: 800, fontSize: 15 }}>{s.nome}</div><div style={{ fontSize: 13, color: C.muted }}><span style={{ color: C.yellow, fontWeight: 800 }}>{s.vendas}</span> / {s.total} · {pct}%</div></div>
            <div className="rounded-full h-2 overflow-hidden" style={{ background: C.surface2 }}><div style={{ width: `${pct}%`, height: "100%", background: C.yellow }} /></div>
          </div>
        ); })}
        {total === 0 && <Empty>Nenhum atendimento registrado neste período.</Empty>}
      </div>
    </div>
  );
}

/* ---------- Cadastro de vendedores (diretoria) ---------- */
function CadastroVendedores({ vendedores, onCadastrar, onExcluir, onDefinirPin }) {
  const [nome, setNome] = useState("");
  const [pin, setPin] = useState("");
  const [editId, setEditId] = useState(null);
  const [novoPin, setNovoPin] = useState("");

  const add = async () => {
    const n = nome.trim(); const p = pin.trim();
    if (n && p.length === 4) { await onCadastrar(n, p); setNome(""); setPin(""); }
  };
  const salvarPin = async (id) => { if (novoPin.length === 4) { await onDefinirPin(id, novoPin); setEditId(null); setNovoPin(""); } };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-3 space-y-2" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex gap-2">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do vendedor" className="flex-1 rounded-xl px-3 py-2.5 outline-none" style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: 14 }} />
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="PIN" className="rounded-xl px-3 py-2.5 outline-none text-center" style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.yellow, fontWeight: 800, fontSize: 14, width: 84, letterSpacing: "0.3em" }} />
        </div>
        <button type="button" onClick={add} disabled={!nome.trim() || pin.length !== 4} className="w-full rounded-xl py-2.5 flex items-center justify-center gap-1.5" style={{ background: nome.trim() && pin.length === 4 ? C.yellow : C.surface2, color: nome.trim() && pin.length === 4 ? "#000" : C.muted, fontWeight: 800, fontSize: 14 }}><Plus size={18} /> Cadastrar vendedor</button>
      </div>

      <div className="space-y-2">
        {[...vendedores].sort((a, b) => a.nome.localeCompare(b.nome)).map((v) => (
          <div key={v.id} className="rounded-2xl p-3.5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{v.nome}</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setEditId(editId === v.id ? null : v.id); setNovoPin(""); }} className="rounded-lg p-2" style={{ background: C.surface2 }}><KeyRound size={16} color={C.yellow} /></button>
                <button type="button" onClick={() => onExcluir(v.id)} className="rounded-lg p-2" style={{ background: C.surface2 }}><Trash2 size={16} color={C.red} /></button>
              </div>
            </div>
            {editId === v.id && (
              <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, color: C.muted }}>Novo PIN</span>
                <input value={novoPin} onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoFocus className="rounded-lg px-3 py-1.5 outline-none text-center" style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.yellow, fontSize: 15, fontWeight: 800, width: 90, letterSpacing: "0.3em" }} />
                <button type="button" onClick={() => salvarPin(v.id)} disabled={novoPin.length !== 4} className="rounded-lg px-3 py-1.5" style={{ background: novoPin.length === 4 ? C.yellow : C.surface2, color: novoPin.length === 4 ? "#000" : C.muted, fontWeight: 800, fontSize: 13 }}>Salvar</button>
              </div>
            )}
          </div>
        ))}
        {vendedores.length === 0 && <Empty>Nenhum vendedor cadastrado nesta loja.</Empty>}
      </div>
    </div>
  );
}

/* ============================================================
   Teclado de PIN (validação no servidor)
   ============================================================ */
function PinModal({ titulo, nome, onSubmit, onClose }) {
  const [entry, setEntry] = useState("");
  const [erro, setErro] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const tecla = async (d) => {
    if (busyRef.current) return;
    if (d === "back") { setErro(false); return setEntry((p) => p.slice(0, -1)); }
    if (d === "clear") { setErro(false); return setEntry(""); }
    if (entry.length >= 4) return;
    const next = entry + d;
    setEntry(next);
    if (next.length === 4) {
      busyRef.current = true; setBusy(true);
      const ok = await onSubmit(next);
      busyRef.current = false; setBusy(false);
      if (ok) onClose();
      else { setErro(true); setTimeout(() => setEntry(""), 600); }
    }
  };

  return (
    <Modal>
      <div className="flex items-center gap-2 mb-1" style={{ color: C.muted, fontSize: 12 }}><Lock size={13} /> {titulo}</div>
      <div style={{ fontWeight: 900, fontSize: 22 }} className="mb-1">{nome}</div>
      <div style={{ color: C.muted, fontSize: 13 }} className="mb-4">Digite seu PIN para confirmar.</div>
      <div className="flex justify-center gap-3 mb-1">{[0, 1, 2, 3].map((i) => (<div key={i} style={{ width: 14, height: 14, borderRadius: 999, background: erro ? C.red : entry.length > i ? C.yellow : C.surface2, border: `1px solid ${erro ? C.red : C.border}` }} />))}</div>
      <div style={{ height: 18, color: erro ? C.red : C.muted, fontSize: 12, fontWeight: 700 }} className="text-center mb-3">{busy ? "Verificando…" : erro ? "PIN incorreto" : ""}</div>
      <div className="grid grid-cols-3 gap-2.5">
        {["1","2","3","4","5","6","7","8","9"].map((d) => <KeyBtn key={d} onClick={() => tecla(d)}>{d}</KeyBtn>)}
        <KeyBtn onClick={() => tecla("clear")} muted>C</KeyBtn><KeyBtn onClick={() => tecla("0")}>0</KeyBtn><KeyBtn onClick={() => tecla("back")} muted><Delete size={20} color={C.muted} /></KeyBtn>
      </div>
      <button type="button" onClick={onClose} className="w-full mt-4 py-2" style={{ color: C.muted, fontSize: 13 }}>Cancelar</button>
    </Modal>
  );
}

/* ============================================================
   UI helpers
   ============================================================ */
const Screen = ({ children, flex }) => (
  <div style={{ background: C.bg, color: C.text, minHeight: "100vh" }} className={`font-sans${flex ? " flex flex-col" : ""}`}>{children}</div>
);
const Splash = ({ texto = "Carregando…", extra }) => (
  <Screen><div className="min-h-screen grid place-items-center px-6"><div className="text-center"><Logo size={52} center /><div style={{ color: C.muted, fontSize: 14 }} className="mt-4">{texto}</div>{extra}</div></div></Screen>
);
const Logo = ({ size = 40, center }) => (
  <div className={center ? "inline-grid place-items-center rounded-2xl" : "grid place-items-center rounded-2xl"} style={{ width: size, height: size, background: C.yellow }}>
    <span style={{ color: "#000", fontWeight: 900, fontSize: size * 0.54 }}>A</span>
  </div>
);
const Field = ({ icon: Icon, children }) => (
  <div className="flex items-center gap-2 rounded-xl px-3 mb-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}><Icon size={18} color={C.muted} />{children}</div>
);
const Topbar = ({ sub, onLogout }) => (
  <header className="px-4 pt-4 pb-3 sticky top-0 z-20" style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2"><Logo size={34} /><div className="leading-tight"><div style={{ fontSize: 10, letterSpacing: 2, color: C.muted }}>ÓTICAS AMIGÃO · {sub}</div><div style={{ fontWeight: 800, fontSize: 15 }}>Vez de Atendimento</div></div></div>
      <button type="button" onClick={onLogout} className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: C.surface2, border: `1px solid ${C.border}` }}><LogOut size={14} color={C.muted} /><span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>Sair</span></button>
    </div>
  </header>
);
const BottomNav = ({ tab, setTab }) => (
  <nav className="fixed bottom-0 inset-x-0 z-20" style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}>
    <div className="max-w-md mx-auto grid grid-cols-3">
      {[["fila", Bell, "Fila"], ["indicadores", BarChart3, "Conversão"], ["equipe", Users, "Equipe"]].map(([k, Icon, label]) => (
        <button type="button" key={k} onClick={() => setTab(k)} className="flex flex-col items-center gap-1 py-3"><Icon size={20} color={tab === k ? C.yellow : C.muted} /><span style={{ fontSize: 11, fontWeight: 700, color: tab === k ? C.yellow : C.muted }}>{label}</span></button>
      ))}
    </div>
  </nav>
);
const Modal = ({ children }) => (
  <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,.78)" }}><div className="w-full max-w-xs rounded-3xl p-6" style={{ background: C.surface, border: `1px solid ${C.border}` }}>{children}</div></div>
);
const KeyBtn = ({ children, onClick, muted }) => (<button type="button" onClick={onClick} className="rounded-2xl grid place-items-center" style={{ height: 56, background: muted ? "transparent" : C.surface2, border: `1px solid ${C.border}`, color: C.text, fontSize: 22, fontWeight: 800 }}>{children}</button>);
const Label = ({ children }) => (<div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: C.muted }} className="mb-2 mt-1 uppercase">{children}</div>);
const Empty = ({ children }) => (<div className="rounded-2xl p-5 text-center" style={{ background: C.surface, border: `1px dashed ${C.border}`, color: C.muted, fontSize: 14 }}>{children}</div>);
const Kpi = ({ label, value, accent }) => (<div className="rounded-2xl p-3 text-center" style={{ background: C.surface, border: `1px solid ${C.border}` }}><div style={{ fontSize: 26, fontWeight: 900, color: accent ? C.yellow : C.text }}>{value}</div><div style={{ fontSize: 10, color: C.muted, fontWeight: 700 }} className="uppercase tracking-wide">{label}</div></div>);
const Chip = ({ status }) => { const map = { fila: ["Disponível", C.yellow], atendimento: ["Atendendo", C.green], fora: ["Fora", C.muted] }; const [t, color] = map[status] || map.fora; return <span style={{ fontSize: 10, fontWeight: 800, color, border: `1px solid ${color}`, borderRadius: 999 }} className="px-2 py-0.5 uppercase tracking-wide">{t}</span>; };
