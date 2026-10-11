import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, BedDouble, Check,
    ChevronDown, CircleHelp, ClipboardList, CreditCard, DoorOpen,
    LayoutDashboard, LogOut, Menu, Plus, Search, ShieldCheck, Sparkles,
    Users, Wrench, X
} from "lucide-react";
import { api, send } from "./api.js";

const navigation = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "residents", label: "Residents", icon: Users },
    { id: "rooms", label: "Rooms & beds", icon: BedDouble },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "maintenance", label: "Maintenance", icon: Wrench }
];
const money = (amount) => new Intl.NumberFormat("en-BD", {
    style: "currency", currency: "BDT", maximumFractionDigits: 0
}).format(Number(amount || 0));
const dateLabel = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function App() {
    const [token, setToken] = useState(() => localStorage.getItem("haven_token"));
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem("haven_user") || "null"); } catch { return null; }
    });
    const [page, setPage] = useState("overview");
    const [toast, setToast] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const signOut = useCallback(() => {
        localStorage.removeItem("haven_token");
        localStorage.removeItem("haven_user");
        setToken(null);
        setUser(null);
    }, []);
    useEffect(() => {
        window.addEventListener("haven:unauthorized", signOut);
        return () => window.removeEventListener("haven:unauthorized", signOut);
    }, [signOut]);
    const notify = useCallback((message) => {
        setToast(message);
        window.setTimeout(() => setToast(""), 2800);
    }, []);
    async function login(email, password) {
        const result = await send("/auth/login", { email, password });
        localStorage.setItem("haven_token", result.token);
        localStorage.setItem("haven_user", JSON.stringify(result.user));
        setToken(result.token);
        setUser(result.user);
    }
    if (!token) return <Login onLogin={login} />;
    return (
        <div className="app-shell">
            <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
                <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
                    <span className="brand-mark"><DoorOpen size={22} strokeWidth={2.2} /></span>
                    <span>haven<span className="brand-period">.</span></span>
                </a>
                <div className="workspace-switch"><div className="workspace-avatar">H</div><span className="workspace-label"><strong>Haven House</strong><small>Hostel workspace</small></span><ChevronDown size={16} /></div>
                <p className="nav-caption">WORKSPACE</p>
                <nav className="main-nav">
                    {navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${page === id ? "active" : ""}`} onClick={() => { setPage(id); setSidebarOpen(false); }}><Icon size={18} strokeWidth={1.9} /><span>{label}</span></button>)}
                </nav>
                <div className="sidebar-bottom">
                    <div className="sidebar-promo"><span className="promo-icon"><Sparkles size={16} /></span><strong>A little more peace of mind.</strong><p>Your hostel at a glance, all in one place.</p><div className="promo-illustration"><span>✳</span><span>◒</span><span>✦</span></div></div>
                    <button className="nav-link quiet-link" onClick={() => notify("For help, please contact your hostel administrator.")}><CircleHelp size={18} /><span>Help & support</span></button>
                    <button className="profile-button" onClick={signOut} aria-label="Sign out"><span className="profile-avatar">{user?.fullName?.charAt(0) || "A"}</span><span className="profile-copy"><strong>{user?.fullName || "Administrator"}</strong><small>{user?.role || "Admin"}</small></span><LogOut size={16} className="logout-icon" /></button>
                </div>
            </aside>
            {sidebarOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
            <main className="main-area">
                <header className="topbar">
                    <button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
                    <div className="breadcrumb"><span>Haven House</span><span className="crumb-slash">/</span><strong>{navigation.find((item) => item.id === page)?.label}</strong></div>
                    <div className="topbar-actions"><span className="today-date">{new Date().toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}</span><button className="icon-button notification-button" aria-label="Open maintenance requests" onClick={() => setPage("maintenance")}><Bell size={18} /></button><button className="top-avatar" aria-label="Change password" title="Change password" onClick={() => setAccountOpen(true)}>{user?.fullName?.charAt(0) || "A"}</button></div>
                </header>
                <section className="page-content">
                    {page === "overview" && <Overview onNavigate={setPage} />}
                    {page === "residents" && <Residents onNotify={notify} />}
                    {page === "rooms" && <Rooms onNotify={notify} />}
                    {page === "payments" && <Payments onNotify={notify} />}
                    {page === "maintenance" && <Maintenance onNotify={notify} />}
                </section>
            </main>
            {accountOpen && <ChangePasswordModal onClose={() => setAccountOpen(false)} onSuccess={() => { setAccountOpen(false); notify("Your password has been changed."); }} />}
            {toast && <div className="toast"><span><Check size={15} /></span>{toast}</div>}
        </div>
    );
}

function Login({ onLogin }) {
    const [email, setEmail] = useState(import.meta.env.DEV ? "admin@hostel.local" : "");
    const [password, setPassword] = useState(import.meta.env.DEV ? "ChangeMe123!" : "");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    async function submit(event) {
        event.preventDefault(); setError(""); setLoading(true);
        try { await onLogin(email, password); } catch (err) { setError(err.message); } finally { setLoading(false); }
    }
    return <div className="login-page">
        <div className="login-panel">
            <a className="brand login-brand" href="#"><span className="brand-mark"><DoorOpen size={22} /></span><span>haven<span className="brand-period">.</span></span></a>
            <div className="login-art"><span className="art-sun" /><span className="art-building"><i /><i /><i /><i /><i /><i /></span><span className="art-plant">♧</span></div>
            <div className="login-story"><span className="eyebrow">A softer way to manage</span><h1>Make room for<br /><em>better days.</em></h1><p>All your hostel essentials, thoughtfully brought together.</p></div>
            <span className="login-foot">YOUR HOUSE, IN GOOD HANDS <span>✳</span></span>
        </div>
        <div className="login-form-side"><form className="login-form" onSubmit={submit}>
            <span className="eyebrow">WELCOME BACK</span><h2>Good to see you.</h2><p className="muted">Sign in to your Haven workspace.</p>
            {error && <div className="form-error">{error}</div>}
            <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
            <button className="primary-button login-submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button>
            {import.meta.env.DEV && <p className="demo-hint"><ShieldCheck size={15} /> Local demo: admin@hostel.local · ChangeMe123!</p>}
        </form></div>
    </div>;
}

function Overview({ onNavigate }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const load = useCallback(() => api("/dashboard").then((result) => { setData(result); setError(""); }).catch((err) => setError(err.message)), []);
    useEffect(() => { load(); }, [load]);
    const occupancy = data?.totalBeds ? Math.round(data.occupiedBeds / data.totalBeds * 100) : 0;
    return <>
        <div className="welcome-row"><div><span className="eyebrow">{new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</span><h1>A good day to check in.</h1><p>Here’s what’s happening at Haven House.</p></div><button className="outline-button" onClick={() => onNavigate("maintenance")}><Wrench size={16} /> View maintenance</button></div>
        {error && <div className="inline-error">{error} <button onClick={load}>Try again</button></div>}
        <div className="stats-grid">
            <StatCard label="Residents" value={data?.activeResidents ?? "—"} icon={Users} tone="lavender" note="Currently staying" />
            <StatCard label="Beds occupied" value={`${data?.occupiedBeds ?? "—"} / ${data?.totalBeds ?? "—"}`} icon={BedDouble} tone="sage" note={`${occupancy}% occupancy`} meter={occupancy} />
            <StatCard label="Collected this month" value={data ? money(data.collectedThisMonth) : "—"} icon={ArrowDownLeft} tone="peach" note="Payments received" />
            <StatCard label="Outstanding fees" value={data ? money(data.outstandingFees) : "—"} icon={ArrowUpRight} tone="butter" note="Pending payments" />
        </div>
        <div className="overview-grid">
            <section className="panel resident-panel"><div className="panel-heading"><div><span className="eyebrow">THE HOUSE</span><h2>Recent residents</h2></div><button className="text-button" onClick={() => onNavigate("residents")}>All residents <ArrowRight size={15} /></button></div><ResidentTable residents={data?.recentResidents || []} compact />{!data?.recentResidents?.length && <EmptyState icon={Users} text="Your residents will show up here." />}</section>
            <section className="panel house-panel"><div className="panel-heading"><div><span className="eyebrow">A QUICK LOOK</span><h2>Housekeeping</h2></div><span className="house-icon"><Sparkles size={17} /></span></div>
                <div className="house-progress"><div className="progress-copy"><span>Bed occupancy</span><strong>{occupancy}%</strong></div><div className="progress-track"><span style={{ width: `${occupancy}%` }} /></div><small>{data?.occupiedBeds ?? 0} beds occupied of {data?.totalBeds ?? 0}</small></div>
                <button className="house-row" onClick={() => onNavigate("maintenance")}><span className="house-row-icon peach"><Wrench size={16} /></span><span><strong>{data?.openMaintenance ?? 0} open requests</strong><small>Maintenance to take a look at</small></span><ArrowRight size={16} /></button>
                <button className="house-row" onClick={() => onNavigate("payments")}><span className="house-row-icon butter"><ClipboardList size={16} /></span><span><strong>{data ? money(data.outstandingFees) : "—"} outstanding</strong><small>Fees waiting to be collected</small></span><ArrowRight size={16} /></button>
                <div className="house-note"><span>✳</span><p>A little progress every day makes a happy house.</p></div>
            </section>
        </div>
        <div className="bottom-note"><span>✳</span> A calm, clear view of your hostel—so you can focus on the people in it.</div>
    </>;
}

function StatCard({ label, value, icon: Icon, tone, note, meter }) {
    return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={17} strokeWidth={1.9} /></span></div><strong className="stat-value">{value}</strong><div className="stat-foot">{meter !== undefined ? <div className="mini-meter"><span style={{ width: `${meter}%` }} /></div> : <span className="stat-dot" />}{note}</div></div>;
}

function ResidentTable({ residents, compact = false }) {
    const columns = compact ? <><th>RESIDENT</th><th>ROOM</th><th>STATUS</th><th>LAST PAYMENT</th></> : <><th>RESIDENT</th><th>PHONE</th><th>ROOM / BED</th><th>JOINED</th><th>STATUS</th></>;
    return <div className="table-wrap"><table><thead><tr>{columns}</tr></thead><tbody>{residents.map((r) => <tr key={r.id}><td><span className="table-person"><span className="person-avatar">{r.full_name?.charAt(0)}</span><span><strong>{r.full_name}</strong><small>{r.email}</small></span></span></td>{compact ? <><td>{r.room_number || <span className="muted">Unassigned</span>}</td><td><StatusPill value={r.status} /></td><td>{r.payment_status === "paid" ? <span className="paid-amount">{money(r.latest_payment)}</span> : <span className="muted">{r.payment_status || "No payment"}</span>}</td></> : <><td>{r.phone}</td><td>{r.room_number ? `${r.room_number} · ${r.bed_label}` : <span className="muted">Unassigned</span>}</td><td>{dateLabel(r.joined_on)}</td><td><StatusPill value={r.status} /></td></>}</tr>)}</tbody></table></div>;
}
function StatusPill({ value }) {
    const label = String(value || "pending").replace("_", " ");
    return <span className={`status-pill status-${String(value || "").replace("_", "-")}`}><i />{label}</span>;
}
function EmptyState({ icon: Icon, text }) { return <div className="empty-state"><span><Icon size={19} /></span><p>{text}</p></div>; }
function PageHeading({ eyebrow, title, subtitle, action }) {
    return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}
function PageTable({ columns, rows, empty, renderRow }) {
    return rows.length ? <div className="panel list-panel"><div className="table-wrap"><table><thead><tr>{columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{rows.map(renderRow)}</tbody></table></div></div> : <div className="panel"><EmptyState icon={ClipboardList} text={empty} /></div>;
}
function Modal({ title, onClose, children }) {
    useEffect(() => {
        const close = (event) => { if (event.key === "Escape") onClose(); };
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [onClose]);
    return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><span className="eyebrow">HAVEN HOUSE</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</section></div>;
}
function FormError({ error }) { return error ? <div className="form-error">{error}</div> : null; }

function ChangePasswordModal({ onClose, onSuccess }) {
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        const currentPassword = String(form.get("currentPassword") || "");
        const newPassword = String(form.get("newPassword") || "");
        if (newPassword.length < 16) {
            setError("Your new password must contain at least 16 characters.");
            return;
        }
        if (newPassword !== form.get("confirmPassword")) {
            setError("Your new passwords don't match.");
            return;
        }
        setSaving(true);
        try {
            const { token } = await send("/auth/change-password", { currentPassword, newPassword });
            localStorage.setItem("haven_token", token);
            onSuccess();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return <Modal title="Change your password" onClose={onClose}>
        <form className="modal-form" onSubmit={submit}>
            <FormError error={error} />
            <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={16} required /><span className="form-note">Use at least 16 characters. Choose a password you haven't used elsewhere.</span></label>
            <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={16} required /></label>
            <div className="modal-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Change password"} <ShieldCheck size={15} /></button></div>
        </form>
    </Modal>;
}

function Residents({ onNotify }) {
    const [residents, setResidents] = useState([]);
    const [beds, setBeds] = useState([]);
    const [search, setSearch] = useState("");
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(() => Promise.all([api("/residents"), api("/beds/available")]).then(([people, freeBeds]) => { setResidents(people); setBeds(freeBeds); }).catch((err) => setError(err.message)), []);
    useEffect(() => { load(); }, [load]);
    const filtered = useMemo(() => residents.filter((r) => `${r.full_name} ${r.email} ${r.room_number || ""}`.toLowerCase().includes(search.toLowerCase())), [residents, search]);
    async function create(event) {
        event.preventDefault(); setError("");
        try { await send("/residents", Object.fromEntries(new FormData(event.currentTarget))); setAdding(false); await load(); onNotify("Resident added to the house."); }
        catch (err) { setError(err.message); }
    }
    async function checkOut(resident) {
        if (!window.confirm(`Check out ${resident.full_name} and release their bed?`)) return;
        setError("");
        try { await send(`/residents/${resident.id}/check-out`, {}, "PATCH"); await load(); onNotify(`${resident.full_name} has checked out.`); }
        catch (err) { setError(err.message); }
    }
    return <>
        <PageHeading eyebrow="THE PEOPLE WHO MAKE IT HOME" title="Residents" subtitle="Get to know everyone staying at Haven House." action={<button className="primary-button" onClick={() => setAdding(true)}><Plus size={17} /> Add resident</button>} />
        {error && <div className="inline-error">{error}</div>}
        <div className="list-toolbar"><div className="search-field"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a resident…" /></div><span>{filtered.length} residents</span></div>
        <PageTable columns={["RESIDENT", "PHONE", "ROOM / BED", "JOINED", "STATUS", ""]} rows={filtered} empty="No residents yet. Add someone to get started." renderRow={(r) => <tr key={r.id}><td><span className="table-person"><span className="person-avatar">{r.full_name.charAt(0)}</span><span><strong>{r.full_name}</strong><small>{r.email}</small></span></span></td><td>{r.phone}</td><td>{r.room_number ? `${r.room_number} · ${r.bed_label}` : <span className="muted">Unassigned</span>}</td><td>{dateLabel(r.joined_on)}</td><td><StatusPill value={r.status} /></td><td>{r.status === "active" && <button className="small-action" onClick={() => checkOut(r)}>Check out</button>}</td></tr>} />
        {adding && <Modal title="Welcome a new resident" onClose={() => { setAdding(false); setError(""); }}><form className="modal-form" onSubmit={create}><FormError error={error} /><label>Full name<input name="fullName" required placeholder="e.g. Samira Ahmed" /></label><div className="form-row"><label>Email address<input name="email" type="email" required placeholder="samira@email.com" /></label><label>Phone number<input name="phone" required placeholder="+880 1…" /></label></div><label>Emergency contact<input name="emergencyContact" placeholder="Name and phone (optional)" /></label><label>Assign a bed<select name="bedId" defaultValue=""><option value="">Leave unassigned</option>{beds.map((bed) => <option key={bed.id} value={bed.id}>Room {bed.room_number} · {bed.bed_label}</option>)}</select></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setAdding(false)}>Cancel</button><button className="primary-button">Add resident <ArrowRight size={15} /></button></div></form></Modal>}
    </>;
}

function Rooms({ onNotify }) {
    const [rooms, setRooms] = useState([]);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(() => api("/rooms").then(setRooms).catch((err) => setError(err.message)), []);
    useEffect(() => { load(); }, [load]);
    async function create(event) {
        event.preventDefault(); setError("");
        try { await send("/rooms", Object.fromEntries(new FormData(event.currentTarget))); setAdding(false); await load(); onNotify("New room and beds added."); }
        catch (err) { setError(err.message); }
    }
    const totalBeds = rooms.reduce((sum, room) => sum + Number(room.bed_count), 0);
    const occupiedBeds = rooms.reduce((sum, room) => sum + Number(room.occupied_beds), 0);
    return <>
        <PageHeading eyebrow="A PLACE FOR EVERYONE" title="Rooms & beds" subtitle="Make the most of every corner of the house." action={<button className="primary-button" onClick={() => setAdding(true)}><Plus size={17} /> Add room</button>} />
        {error && <div className="inline-error">{error}</div>}
        <div className="room-summary"><span><BedDouble size={18} /> {totalBeds} total beds</span><span><span className="summary-dot" /> {occupiedBeds} occupied</span><span><span className="summary-dot available" /> {totalBeds - occupiedBeds} available</span></div>
        <div className="room-grid">{rooms.map((room, index) => <article className="room-card" key={room.id}><div className={`room-card-top room-color-${index % 4}`}><span className="room-number-label">ROOM</span><strong>{room.room_number}</strong><span className="room-illustration"><DoorOpen size={42} strokeWidth={1.15} /></span><span className="floor-tag">Floor {room.floor}</span></div><div className="room-card-body"><div className="room-title-row"><h3>{room.room_type} room</h3><span className="room-rent">{money(room.monthly_rent)}<small> / month</small></span></div><div className="room-bed-track">{Array.from({ length: Number(room.bed_count) }, (_, i) => <span key={i} className={i < Number(room.occupied_beds) ? "occupied-bed" : ""}><BedDouble size={15} /></span>)}</div><div className="room-card-foot"><span>{room.occupied_beds} of {room.bed_count} beds occupied</span><span>{room.bed_count - room.occupied_beds} available</span></div></div></article>)}</div>
        {!rooms.length && !error && <div className="panel"><EmptyState icon={BedDouble} text="No rooms yet. Add your first room." /></div>}
        {adding && <Modal title="Add a room" onClose={() => { setAdding(false); setError(""); }}><form className="modal-form" onSubmit={create}><FormError error={error} /><div className="form-row"><label>Room number<input name="roomNumber" required placeholder="e.g. 301" /></label><label>Floor<input name="floor" type="number" min="0" defaultValue="1" required /></label></div><div className="form-row"><label>Room type<select name="roomType"><option>Single</option><option>Double</option><option>Triple</option><option>Shared</option></select></label><label>Bed capacity<input name="capacity" type="number" min="1" max="12" defaultValue="2" required /></label></div><label>Monthly rent per resident<input name="monthlyRent" type="number" min="1" step="0.01" required placeholder="8500" /></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setAdding(false)}>Cancel</button><button className="primary-button">Create room <ArrowRight size={15} /></button></div></form></Modal>}
    </>;
}

function Payments({ onNotify }) {
    const [payments, setPayments] = useState([]);
    const [residents, setResidents] = useState([]);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(() => Promise.all([api("/payments"), api("/residents")]).then(([items, people]) => { setPayments(items); setResidents(people); }).catch((err) => setError(err.message)), []);
    useEffect(() => { load(); }, [load]);
    async function create(event) {
        event.preventDefault(); setError("");
        try { await send("/payments", Object.fromEntries(new FormData(event.currentTarget))); setAdding(false); await load(); onNotify("Payment record added."); }
        catch (err) { setError(err.message); }
    }
    async function markPaid(id) {
        try { await send(`/payments/${id}/mark-paid`, { paymentMethod: "cash" }, "PATCH"); await load(); onNotify("Payment marked as paid."); }
        catch (err) { setError(err.message); }
    }
    const paid = payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount), 0);
    const pending = payments.filter((item) => ["pending", "overdue"].includes(item.status)).reduce((sum, item) => sum + Number(item.amount), 0);
    return <>
        <PageHeading eyebrow="A HEALTHY HOUSEHOLD" title="Payments" subtitle="Keep an easy eye on rent and resident contributions." action={<button className="primary-button" onClick={() => setAdding(true)}><Plus size={17} /> Add payment</button>} />
        {error && <div className="inline-error">{error}</div>}
        <div className="payment-totals"><div className="payment-total-card"><span className="stat-icon sage"><ArrowDownLeft size={17} /></span><span>Payments received</span><strong>{money(paid)}</strong></div><div className="payment-total-card"><span className="stat-icon butter"><ArrowUpRight size={17} /></span><span>Awaiting payment</span><strong>{money(pending)}</strong></div><div className="payment-total-card"><span className="stat-icon lavender"><CreditCard size={17} /></span><span>All records</span><strong>{payments.length}</strong></div></div>
        <PageTable columns={["RESIDENT", "AMOUNT", "DUE DATE", "METHOD", "STATUS", ""]} rows={payments} empty="No payment records yet." renderRow={(item) => <tr key={item.id}><td><span className="table-person"><span className="person-avatar">{item.resident_name?.charAt(0)}</span><span><strong>{item.resident_name}</strong><small>{item.email}</small></span></span></td><td><strong>{money(item.amount)}</strong></td><td>{dateLabel(item.due_date)}</td><td>{item.payment_method?.replace("_", " ") || "—"}</td><td><StatusPill value={item.status} /></td><td>{item.status === "pending" && <button className="small-action" onClick={() => markPaid(item.id)}>Mark paid</button>}</td></tr>} />
        {adding && <Modal title="Add a payment record" onClose={() => { setAdding(false); setError(""); }}><form className="modal-form" onSubmit={create}><FormError error={error} /><label>Resident<select name="residentId" required defaultValue=""><option value="" disabled>Select a resident</option>{residents.map((resident) => <option key={resident.id} value={resident.id}>{resident.full_name}</option>)}</select></label><div className="form-row"><label>Amount (BDT)<input name="amount" type="number" min="1" step="0.01" required placeholder="8500" /></label><label>Due date<input name="dueDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label></div><div className="form-row"><label>Payment method<select name="paymentMethod"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="mobile_money">Mobile money</option></select></label><label>Status<select name="status"><option value="paid">Paid</option><option value="pending">Pending</option></select></label></div><label>Reference<input name="reference" placeholder="Optional receipt / transaction ID" /></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setAdding(false)}>Cancel</button><button className="primary-button">Save payment <ArrowRight size={15} /></button></div></form></Modal>}
    </>;
}

function Maintenance({ onNotify }) {
    const [tickets, setTickets] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [residents, setResidents] = useState([]);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState("");
    const load = useCallback(() => Promise.all([api("/maintenance"), api("/rooms"), api("/residents")]).then(([items, roomList, people]) => { setTickets(items); setRooms(roomList); setResidents(people); }).catch((err) => setError(err.message)), []);
    useEffect(() => { load(); }, [load]);
    async function create(event) {
        event.preventDefault(); setError("");
        try { await send("/maintenance", Object.fromEntries(new FormData(event.currentTarget))); setAdding(false); await load(); onNotify("Maintenance request added."); }
        catch (err) { setError(err.message); }
    }
    async function updateStatus(id, status) {
        try { await send(`/maintenance/${id}/status`, { status }, "PATCH"); await load(); onNotify("Request status updated."); }
        catch (err) { setError(err.message); }
    }
    return <>
        <PageHeading eyebrow="LOOKING AFTER THE LITTLE THINGS" title="Maintenance" subtitle="A comfortable home is made of many small fixes." action={<button className="primary-button" onClick={() => setAdding(true)}><Plus size={17} /> New request</button>} />
        {error && <div className="inline-error">{error}</div>}
        <div className="ticket-grid">{tickets.map((ticket) => <article className="panel ticket-card" key={ticket.id}><div className="ticket-top"><span className={`priority-pill priority-${ticket.priority}`}>{ticket.priority} priority</span><span className="ticket-date">{dateLabel(ticket.created_at)}</span></div><h3>{ticket.title}</h3><p className="ticket-description">{ticket.description}</p><div className="ticket-location"><span className="room-location"><DoorOpen size={14} />{ticket.room_number ? `Room ${ticket.room_number}` : "Common area"}</span>{ticket.resident_name && <span>· {ticket.resident_name}</span>}</div><div className="ticket-footer"><StatusPill value={ticket.status} /><select aria-label="Update ticket status" value={ticket.status} onChange={(event) => updateStatus(ticket.id, event.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></div></article>)}</div>
        {!tickets.length && !error && <div className="panel"><EmptyState icon={Wrench} text="No maintenance requests. The house is looking good." /></div>}
        {adding && <Modal title="Add a maintenance request" onClose={() => { setAdding(false); setError(""); }}><form className="modal-form" onSubmit={create}><FormError error={error} /><label>What needs attention?<input name="title" required placeholder="e.g. Leaky tap in the kitchen" /></label><label>A few details<textarea name="description" required rows="3" placeholder="Describe what happened and what needs fixing…" /></label><div className="form-row"><label>Room<select name="roomId" defaultValue=""><option value="">Common area / not sure</option>{rooms.map((room) => <option key={room.id} value={room.id}>Room {room.room_number}</option>)}</select></label><label>Priority<select name="priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><label>Reported by<select name="residentId" defaultValue=""><option value="">Staff / unknown</option>{residents.map((resident) => <option key={resident.id} value={resident.id}>{resident.full_name}</option>)}</select></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setAdding(false)}>Cancel</button><button className="primary-button">Add request <ArrowRight size={15} /></button></div></form></Modal>}
    </>;
}