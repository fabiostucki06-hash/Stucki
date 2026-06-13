interface PhoneProps {
  cls: string;
  label: string;
  frame1: string; frame2: string;
  rim1: string; rim2: string;
  wall1: string; wall2: string; wallGlow: string;
  sheen: string; btn: string;
}

function Phone({ cls, label, frame1, frame2, rim1, rim2, wall1, wall2, wallGlow, sheen, btn }: PhoneProps) {
  const id = cls.replace(/\s.*/, '');
  return (
    <div className={cls} role="img" aria-label={`iPhone in ${label}`}>
      <svg className="ih-phone-svg" viewBox="0 0 145 300" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`${id}-fr`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={frame1}/><stop offset="50%" stopColor={frame2}/><stop offset="100%" stopColor={frame2}/>
          </linearGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={rim1}/><stop offset="100%" stopColor={rim2}/>
          </linearGradient>
          <linearGradient id={`${id}-wall`} x1=".2" y1="0" x2=".8" y2="1">
            <stop offset="0%" stopColor={wall1}/><stop offset="100%" stopColor={wall2}/>
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="38%" cy="20%" r="50%">
            <stop offset="0%" stopColor={wallGlow} stopOpacity=".45"/><stop offset="100%" stopColor={wallGlow} stopOpacity="0"/>
          </radialGradient>
          <linearGradient id={`${id}-sh`} x1="0" y1="0" x2=".55" y2=".18">
            <stop offset="0%" stopColor={sheen}/><stop offset="100%" stopColor="rgba(255,255,255,0)"/>
          </linearGradient>
        </defs>
        <rect x=".5" y=".5" width={144} height={299} rx={35.5} fill={`url(#${id}-fr)`}/>
        <rect x=".5" y=".5" width={144} height={299} rx={35.5} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={1}/>
        <rect x={6} y={6} width={133} height={288} rx={30} fill={`url(#${id}-wall)`}/>
        <rect x={6} y={6} width={133} height={288} rx={30} fill={`url(#${id}-glow)`}/>
        <rect x={6} y={6} width={62} height={288} rx={30} fill={`url(#${id}-sh)`}/>
        <rect x={49} y={18.5} width={47} height={13} rx={6.5} fill="#000"/>
        <text x={20} y={33.5} fill="rgba(255,255,255,.88)" fontSize={8.5} fontFamily="-apple-system,sans-serif" fontWeight={600}>9:41</text>
        <rect x={106} y={27.5} width={3} height={5} rx={.7} fill="rgba(255,255,255,.8)"/>
        <rect x={110.5} y={25.5} width={3} height={7} rx={.7} fill="rgba(255,255,255,.8)"/>
        <rect x={115} y={23.5} width={3} height={9} rx={.7} fill="rgba(255,255,255,.8)"/>
        <rect x={120.5} y={26.5} width={11} height={7} rx={1.5} stroke="rgba(255,255,255,.6)" strokeWidth={.8} fill="none"/>
        <rect x={121.5} y={27.5} width={8.5} height={5} rx={.9} fill="rgba(255,255,255,.68)"/>
        <rect x={131.5} y={28.8} width={1.5} height={3.5} rx={.7} fill="rgba(255,255,255,.4)"/>
        <text x={72.5} y={110} fill="rgba(255,255,255,.94)" fontSize={40} fontFamily="-apple-system,sans-serif" fontWeight={200} textAnchor="middle">9:41</text>
        <text x={72.5} y={124} fill="rgba(255,255,255,.44)" fontSize={9.5} fontFamily="-apple-system,sans-serif" textAnchor="middle">Wednesday, June 13</text>
        <rect x={52} y={279} width={41} height={4.5} rx={2.25} fill="rgba(255,255,255,.25)"/>
        <rect x={141} y={94} width={5} height={42} rx={2.5} fill={btn}/>
        <rect x={-1} y={70} width={5} height={14} rx={2.5} fill={btn}/>
        <rect x={-1} y={92} width={5} height={30} rx={2.5} fill={btn}/>
        <rect x={-1} y={128} width={5} height={30} rx={2.5} fill={btn}/>
      </svg>
    </div>
  );
}

const PHONES: PhoneProps[] = [
  { cls: 'ih-p1', label: 'Black Titanium',   frame1: '#52525c', frame2: '#18181a', rim1: 'rgba(255,255,255,.18)', rim2: 'rgba(255,255,255,.02)', wall1: '#1e1456', wall2: '#030712', wallGlow: '#5b4fff', sheen: 'rgba(255,255,255,.10)', btn: '#3a3a3c' },
  { cls: 'ih-p2', label: 'Natural Titanium',  frame1: '#d4d6d9', frame2: '#8e9094', rim1: 'rgba(255,255,255,.60)', rim2: 'rgba(255,255,255,.03)', wall1: '#0c4a6e', wall2: '#0c2340', wallGlow: '#7dd3fc', sheen: 'rgba(255,255,255,.16)', btn: '#a0a2a6' },
  { cls: 'ih-p3', label: 'White Titanium',    frame1: '#ffffff', frame2: '#d6d6dc', rim1: 'rgba(255,255,255,1)',  rim2: 'rgba(200,200,210,.25)', wall1: '#881337', wall2: '#4c0519', wallGlow: '#fda4af', sheen: 'rgba(255,255,255,.26)', btn: '#ccccd2' },
  { cls: 'ih-p4', label: 'Desert Titanium',   frame1: '#e6c992', frame2: '#a6843c', rim1: 'rgba(255,244,186,.72)',rim2: 'rgba(160,118,46,.06)', wall1: '#14532d', wall2: '#052e16', wallGlow: '#86efac', sheen: 'rgba(255,255,255,.12)', btn: '#b49252' },
];

export default function IPhoneHero() {
  return (
    <div style={{ minHeight: '60vh' }}>
      <nav className="ih-apple-nav" role="navigation" aria-label="Apple Store">
        <div className="ih-apple-nav-inner">
          <a href="#" className="ih-nav-logo" aria-label="Apple">
            <svg width={15} height={18} viewBox="0 0 15 18" fill="currentColor" aria-hidden="true">
              <path d="M13.3 9.3c0-2.5 2-3.7 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8C3.3 3.9 1.8 4.9.9 6.5c-1.8 3.3-.5 8.1 1.3 10.8.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.9 3.4-.9s2 .9 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.6-1-2.6-4zM11 3.2c.7-.9 1.2-2.2 1.1-3.5-1 0-2.2.7-2.9 1.6-.6.8-1.2 2.1-1 3.3 1.1.1 2.2-.6 2.8-1.4z"/>
            </svg>
          </a>
          <ul className="ih-nav-links" role="list">
            {['Store','Mac','iPad','iPhone','Watch','AirPods','TV & Home','Support'].map((l) => (
              <li key={l}><a href="#" className={l === 'iPhone' ? 'ih-current' : undefined}>{l}</a></li>
            ))}
          </ul>
          <div className="ih-nav-icons">
            <a href="#" className="ih-nav-icon" aria-label="Search">
              <svg width={15} height={15} viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <circle cx={6.5} cy={6.5} r={5.3} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round"/>
                <line x1={10.5} y1={10.5} x2={13.6} y2={13.6} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round"/>
              </svg>
            </a>
            <a href="#" className="ih-nav-icon" aria-label="Shopping Bag">
              <svg width={14} height={17} viewBox="0 0 14 17" fill="none" aria-hidden="true">
                <path d="M4.6 5.3C4.6 3.1 5.7 1.3 7 1.3s2.4 1.8 2.4 4" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round"/>
                <rect x={1} y={5.6} width={12} height={9.8} rx={1.8} stroke="currentColor" strokeWidth={1.3}/>
              </svg>
            </a>
          </div>
        </div>
      </nav>

      <div className="ih-hero">
        <p className="ih-eyebrow ih-fu ih-d1">New</p>
        <h2 className="ih-display ih-fu ih-d2">iPhone</h2>
        <p className="ih-sub ih-fu ih-d3">Meet the latest iPhone lineup.</p>
        <div className="ih-ctas ih-fu ih-d4">
          <a href="#" className="ih-btn-fill">Learn more</a>
          <a href="#" className="ih-btn-text">
            Shop iPhone
            <svg className="ih-arr" width={7} height={12} viewBox="0 0 7 12" fill="none" aria-hidden="true">
              <path d="M1 1L6 6L1 11" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      </div>

      <div className="ih-phones-wrap" role="region" aria-label="iPhone color lineup">
        <div className="ih-phones-row">
          {PHONES.map((p) => <Phone key={p.cls} {...p} />)}
        </div>
      </div>

      <div className="ih-labels" aria-hidden="true">
        <div className="ih-label">Black Titanium</div>
        <div className="ih-label ih-w">Natural Titanium</div>
        <div className="ih-label ih-w">White Titanium</div>
        <div className="ih-label">Desert Titanium</div>
      </div>
    </div>
  );
}
