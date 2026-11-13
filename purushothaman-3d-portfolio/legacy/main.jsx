import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import {
  ArrowDown, ArrowUpRight, Github, Linkedin, Mail, Phone, MapPin,
  Code2, Layers3, Smartphone, Cloud, FileText, Scale, Workflow,
  ExternalLink, Menu, X, Sparkles, BriefcaseBusiness, GraduationCap,
  ChevronRight, Download, Send
} from 'lucide-react';
import './style.css';

const profile = {
  name: 'Purushothaman Senthilkumar',
  role: 'Full Stack Software Engineer',
  location: 'Chennai, Tamil Nadu, India',
  email: 'purusoth042001@gmail.com',
  phone: '+91 99659 91405',
  linkedin: 'https://linkedin.com/in/purushothaman-senthilkumar',
  summary: 'Full Stack Software Engineer with 2+ years of experience building production software at OctoGenie. Primary work is Just4Lawyer, a multi-tenant legal-practice platform shipped as a React web application and a Flutter mobile app on a Node.js and MongoDB API. Delivered practice management, payments, document editing and OCR, and automated case tracking across Indian court portals. Also built eSign & Aadhaar eSign as a separate signing product, and OctoGenie Office, an in-house suite for Word, PDF, spreadsheet and presentation editing.',
};

const skillGroups = [
  { title: 'Frontend', icon: Code2, items: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Tailwind CSS', 'Vite', 'TanStack Query', 'i18next'] },
  { title: 'Backend', icon: Workflow, items: ['Node.js', 'Express.js', 'REST APIs', 'Socket.IO', 'JWT', 'Fastify', 'Java', 'Spring Boot', 'Python', 'Playwright'] },
  { title: 'Databases', icon: Layers3, items: ['MongoDB', 'Mongoose', 'MySQL', 'SQL', 'SQLite (Drift)', 'Hive'] },
  { title: 'Mobile', icon: Smartphone, items: ['Flutter', 'Dart', 'Riverpod', 'go_router', 'Dio', 'Offline-first sync', 'Firebase Cloud Messaging'] },
  { title: 'Cloud & DevOps', icon: Cloud, items: ['AWS S3', 'AWS CloudFront', 'Firebase Authentication', 'Docker', 'Docker Compose', 'Nginx', 'PM2', 'GitHub Actions'] },
  { title: 'Integrations & tools', icon: Sparkles, items: ['Cashfree', 'Razorpay', 'PhonePe', 'WhatsApp Business API', 'Google / Microsoft / Apple Calendar', 'ONLYOFFICE', 'Aadhaar eSign', 'Tesseract.js', 'PDF.js', 'Git', 'GitHub', 'Cursor'] },
];

const projects = [
  {
    number: '01', title: 'Just4Lawyer', type: 'LEGAL PRACTICE MANAGEMENT · WEB + MOBILE',
    description: 'Multi-tenant legal-practice SaaS for Indian law firms. Built across React web, Flutter mobile and a shared Node.js API, covering cases, matters, documents, approvals, billing and reporting.',
    highlights: ['Firm-scoped workflows and permissions', 'Offline-first mobile sync and document scanning with OCR', 'Payments, calendars, notifications and custom reports'],
    stack: ['React', 'TypeScript', 'Node.js', 'Express', 'MongoDB', 'Flutter', 'Dart', 'AWS'],
    icon: Scale, tone: 'violet'
  },
  {
    number: '02', title: 'EZ-Draft', type: 'DOCUMENT EDITING & OCR',
    description: 'Document upload, preview, editing and review for Word, PDF and text files, integrated into the legal-practice platform.',
    highlights: ['ONLYOFFICE integration with JWT-secured file serving', 'Document-to-PDF conversion and OCR digitization', 'Version history, annotations and AI-assisted drafting'],
    stack: ['ONLYOFFICE Docs', 'Node.js', 'Express', 'Tesseract.js', 'AWS S3', 'Docker'],
    icon: FileText, tone: 'blue'
  },
  {
    number: '03', title: 'eCourts Case Tracking', type: 'AUTOMATION · INDIAN COURT PORTALS',
    description: 'Automated case-status tracking for District Court, High Court and Supreme Court portals, including case import and daily hearing updates.',
    highlights: ['Supreme Court scraper with CNR search', 'High Court CNR routing and scheduled sync', 'Daily hearing-summary emails and WhatsApp notifications'],
    stack: ['Python', 'Playwright', 'Node.js', 'MongoDB', 'Cron jobs', 'Resend'],
    icon: Workflow, tone: 'cyan'
  },
  {
    number: '04', title: 'eSign & Aadhaar eSign', type: 'ELECTRONIC SIGNATURE PLATFORM',
    description: 'Standalone electronic-signature product for legal PDFs, supporting multiple signers, placed signature fields and Aadhaar eSign.',
    highlights: ['Click-to-place signature fields on PDF pages', 'Signer-specific field colors and PDF coordinate mapping', 'Aadhaar eSign workflow and audit-trail PDF generation'],
    stack: ['React', 'TypeScript', 'PDF.js', 'Node.js', 'Express', 'MongoDB', 'AWS S3'],
    icon: FileText, tone: 'orange'
  },
  {
    number: '05', title: 'OctoGenie Office', type: 'OFFICE & PRODUCTIVITY SUITE',
    description: 'In-house office suite for documents, spreadsheets, presentations and PDFs, embedded into the legal platform for preview, editing and review.',
    highlights: ['Word editor with paged layout, styles, tables, headers and footers', 'PDF annotations, form filling and page operations', 'Spreadsheet and presentation import/export with autosave and revision history'],
    stack: ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Tiptap', 'PDF.js', 'pdf-lib', 'Univer', 'Fastify'],
    icon: Layers3, tone: 'green'
  },
  {
    number: '06', title: 'WhatsApp Customer Feedback', type: 'SALESFORCE · CUSTOMER EXPERIENCE',
    description: 'Automated customer feedback collection and conversation workflows, turning responses into business insights and reducing manual follow-up and data-entry errors.',
    highlights: ['WhatsApp feedback conversations', 'Genie Bonus application integration', 'Store bonus system development and testing'],
    stack: ['Salesforce', 'Apex', 'Lightning Web Components', 'Batch Apex', 'Queueable Apex', 'WhatsApp'],
    icon: Workflow, tone: 'pink'
  }
];

function Scene3D() {
  const mount = useRef(null);
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 8);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);
    const geometry = new THREE.IcosahedronGeometry(2.05, 2);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x7668ff, metalness: 0.52, roughness: 0.19,
      transmission: 0.12, thickness: 0.8, clearcoat: 1, clearcoatRoughness: 0.12,
      wireframe: false
    });
    const core = new THREE.Mesh(geometry, material);
    group.add(core);
    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.13, 1),
      new THREE.MeshBasicMaterial({ color: 0x9b91ff, wireframe: true, transparent: true, opacity: 0.24 })
    );
    group.add(wire);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x42d9ff, transparent: true, opacity: 0.55 });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.012, 8, 180), ringMat);
    ring1.rotation.x = 1.15; ring1.rotation.y = 0.35; group.add(ring1);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.008, 8, 180), new THREE.MeshBasicMaterial({ color: 0x9b91ff, transparent: true, opacity: 0.35 }));
    ring2.rotation.x = 0.35; ring2.rotation.y = 1.05; group.add(ring2);

    const particlesGeo = new THREE.BufferGeometry();
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 3.6 + Math.random() * 2.2;
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(b) * Math.cos(a);
      positions[i * 3 + 1] = r * Math.sin(b) * Math.sin(a);
      positions[i * 3 + 2] = r * Math.cos(b);
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(particlesGeo, new THREE.PointsMaterial({ color: 0x8c83ff, size: 0.018, transparent: true, opacity: 0.75 }));
    scene.add(particles);

    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const key = new THREE.PointLight(0x8a7dff, 26, 30); key.position.set(4, 3, 5); scene.add(key);
    const fill = new THREE.PointLight(0x39d9ff, 16, 25); fill.position.set(-4, -2, 3); scene.add(fill);

    let pointerX = 0, pointerY = 0, frame;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.35;
      pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.25;
    };
    el.addEventListener('pointermove', onMove);
    const animate = () => {
      frame = requestAnimationFrame(animate);
      group.rotation.y += 0.0026;
      group.rotation.x += 0.0009;
      group.rotation.y += (pointerX - group.rotation.y) * 0.001;
      group.rotation.x += (pointerY - group.rotation.x) * 0.001;
      wire.rotation.y -= 0.0012;
      ring1.rotation.z += 0.0015;
      ring2.rotation.x += 0.0008;
      particles.rotation.y -= 0.00025;
      renderer.render(scene, camera);
    };
    animate();
    const resize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener('pointermove', onMove);
      renderer.dispose();
      geometry.dispose(); material.dispose(); particlesGeo.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);
  return <div className="scene3d" ref={mount} aria-label="Animated 3D abstract geometric object" />;
}

function Header() {
  const [open, setOpen] = useState(false);
  const links = [['About', '#about'], ['Skills', '#skills'], ['Experience', '#experience'], ['Projects', '#projects'], ['Contact', '#contact']];
  return <header className="header">
    <a className="brand" href="#top"><span className="brand-mark">P<span>.</span></span><span>PURUSHOTHAMAN<span className="brand-sub">PORTFOLIO / 2026</span></span></a>
    <button className="menu-toggle" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X/> : <Menu/>}</button>
    <nav className={open ? 'nav nav-open' : 'nav'}>
      {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
      <a className="nav-cta" href="#contact">Let's talk <ArrowUpRight size={15}/></a>
    </nav>
  </header>;
}

function SectionHeading({ eyebrow, title, number }) {
  return <div className="section-heading"><div><span className="eyebrow">{number} / {eyebrow}</span><h2>{title}</h2></div><span className="heading-line"/></div>;
}

function App() {
  const [activeFilter, setActiveFilter] = useState('All');
  const filters = ['All', 'Legal Tech', 'Documents', 'Automation', 'Productivity'];
  const categories = {
    'Just4Lawyer': 'Legal Tech', 'EZ-Draft': 'Documents', 'eCourts Case Tracking': 'Automation',
    'eSign & Aadhaar eSign': 'Documents', 'OctoGenie Office': 'Productivity', 'WhatsApp Customer Feedback': 'Automation'
  };
  const shown = projects.filter(p => activeFilter === 'All' || categories[p.title] === activeFilter);
  return <>
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <Header/>
    <main id="top">
      <section className="hero container">
        <div className="hero-copy">
          <div className="availability"><span className="pulse"/> OPEN TO BUILDING WHAT'S NEXT</div>
          <p className="eyebrow">FULL STACK SOFTWARE ENGINEER <span className="muted">— CHENNAI, INDIA</span></p>
          <h1>Turning complex<br/>problems into<br/><span className="gradient-text">working products.</span></h1>
          <p className="hero-description">{profile.summary}</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#projects">Explore my work <ArrowUpRight size={17}/></a>
            <a className="button button-ghost" href="#contact">Get in touch <Mail size={16}/></a>
          </div>
          <div className="hero-meta">
            <span><MapPin size={14}/>{profile.location}</span>
            <span><BriefcaseBusiness size={14}/>2+ years experience</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-label label-top"><span>FIG. 001</span><span>ENGINEERING / SYSTEMS</span></div>
          <Scene3D/>
          <div className="orbit-caption"><span className="orbit-dot"/> BUILD · SHIP · IMPROVE</div>
          <div className="visual-label label-bottom"><span>REACT / NODE / FLUTTER</span><span>13° 04' N — 80° 16' E</span></div>
        </div>
        <a className="scroll-cue" href="#about"><span>SCROLL TO EXPLORE</span><ArrowDown size={15}/></a>
      </section>

      <section id="about" className="section container">
        <SectionHeading number="01" eyebrow="A LITTLE ABOUT ME" title="Engineering with purpose."/>
        <div className="about-grid">
          <p className="about-lead">I build software that helps people get real work done — from legal case management to document workflows and mobile experiences.</p>
          <div className="about-detail">
            <p>At <strong>OctoGenie Private Limited</strong>, I work across the full product lifecycle: frontend experiences, backend APIs, mobile applications, integrations, and production infrastructure.</p>
            <p>My work spans multi-tenant SaaS, payment integrations, automated court tracking, OCR-powered document workflows, and office productivity tools.</p>
            <a className="text-link" href={profile.linkedin} target="_blank" rel="noreferrer">Connect on LinkedIn <ArrowUpRight size={15}/></a>
          </div>
        </div>
        <div className="stat-grid">
          <div className="stat"><strong>2+</strong><span>Years of experience</span></div>
          <div className="stat"><strong>500</strong><span>Nearly 500 commits</span></div>
          <div className="stat"><strong>06</strong><span>Selected projects</span></div>
          <div className="stat"><strong>03</strong><span>Core product areas</span></div>
        </div>
      </section>

      <section id="skills" className="section section-dark">
        <div className="container">
          <SectionHeading number="02" eyebrow="MY TOOLKIT" title="A practical, full-stack toolkit."/>
          <p className="section-intro">Technologies used across production web, mobile, backend, cloud, and integration work.</p>
          <div className="skills-grid">
            {skillGroups.map(group => {
              const Icon = group.icon;
              return <article className="skill-card" key={group.title}>
                <div className="skill-title"><span className="skill-icon"><Icon size={18}/></span><h3>{group.title}</h3></div>
                <div className="tag-list">{group.items.map(item => <span className="tag" key={item}>{item}</span>)}</div>
              </article>;
            })}
          </div>
        </div>
      </section>

      <section id="experience" className="section container">
        <SectionHeading number="03" eyebrow="WHERE I'VE WORKED" title="Experience that ships."/>
        <div className="timeline">
          <div className="timeline-item">
            <div className="timeline-date">2024 — PRESENT</div>
            <div className="timeline-marker"><span/></div>
            <div className="timeline-content">
              <div className="timeline-top"><div><h3>Software Engineer — Full Stack</h3><p className="company">OctoGenie Private Limited <span>· India</span></p></div><span className="current-badge">CURRENT</span></div>
              <p>Product engineering for Just4Lawyer, a multi-tenant legal-practice SaaS used by law firms.</p>
              <ul>
                <li>Developed features across React and TypeScript web, Express and MongoDB APIs, and Flutter mobile; contributed nearly 500 commits.</li>
                <li>Built practice-management modules for matters, cases, clients, leads, tasks, hearings, invoices, expenses, retainers, custom fields, web forms and reports.</li>
                <li>Implemented role-based permissions, invitations, email OTP, TOTP two-factor authentication, login lockout and verified password reset.</li>
                <li>Integrated Cashfree, Razorpay and PhonePe, plus Google, Microsoft and Apple calendars.</li>
                <li>Supported production services using Docker, Nginx, PM2, AWS S3, CloudFront and GitHub Actions.</li>
              </ul>
            </div>
          </div>
          <div className="timeline-item">
            <div className="timeline-date">APR 2023 — OCT 2023</div>
            <div className="timeline-marker"><span/></div>
            <div className="timeline-content">
              <h3>Salesforce Developer</h3><p className="company">Innoviti Technologies Pvt. Ltd. <span>· Chennai, India</span></p>
              <p>Developed product features in Java and Salesforce, including Apex, Lightning Web Components, Batch Apex and Queueable Apex.</p>
              <ul>
                <li>Built a WhatsApp Customer Feedback application to automate feedback collection and reduce manual follow-up and data-entry errors.</li>
                <li>Integrated the Genie Bonus application with WhatsApp and developed and tested the store bonus system.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="projects" className="section section-dark">
        <div className="container">
          <SectionHeading number="04" eyebrow="SELECTED WORK" title="Products, not just projects."/>
          <div className="project-toolbar"><p className="section-intro">A selection of products and features built across legal technology, documents, automation, and productivity.</p>
            <div className="filters">{filters.map(f => <button className={activeFilter === f ? 'filter active' : 'filter'} key={f} onClick={() => setActiveFilter(f)}>{f}</button>)}</div>
          </div>
          <div className="projects-grid">
            {shown.map(project => {
              const Icon = project.icon;
              return <article className={`project-card ${project.tone}`} key={project.number}>
                <div className="project-card-top"><span className="project-number">{project.number} / 06</span><span className="project-icon"><Icon size={21}/></span></div>
                <p className="project-type">{project.type}</p><h3>{project.title}</h3><p className="project-description">{project.description}</p>
                <ul className="project-highlights">{project.highlights.map(h => <li key={h}><ChevronRight size={14}/>{h}</li>)}</ul>
                <div className="project-stack">{project.stack.map(s => <span key={s}>{s}</span>)}</div>
              </article>;
            })}
          </div>
        </div>
      </section>

      <section className="section container education">
        <SectionHeading number="05" eyebrow="EDUCATION" title="The foundations."/>
        <div className="education-row"><div className="education-icon"><GraduationCap/></div><div><h3>Bachelor of Science in Computer Science</h3><p>Jamal Mohamed College, Bharathidasan University, Trichy</p></div><span className="education-year">2022 · CGPA 6.9</span></div>
        <div className="education-row"><div className="education-icon"><GraduationCap/></div><div><h3>Higher Secondary — Computer Science</h3><p>Boys Higher Secondary School, Srirangam, Trichy</p></div><span className="education-year">2019</span></div>
        <div className="education-row"><div className="education-icon"><GraduationCap/></div><div><h3>Secondary School</h3><p>SVM Matric Higher Secondary School, Trichy</p></div><span className="education-year">2017 · 79%</span></div>
        <div className="cert-row"><span className="eyebrow">CERTIFICATION</span><strong>Java Full Stack Development</strong><span>Payilagam, Chennai</span></div>
      </section>

      <section id="contact" className="contact-section">
        <div className="container contact-inner">
          <p className="eyebrow">06 / START A CONVERSATION</p>
          <h2>Have a problem<br/>worth <span className="gradient-text">solving?</span></h2>
          <p className="contact-copy">If you're building something useful in legal tech, productivity, or software engineering, I'd like to hear about it.</p>
          <a className="button button-primary contact-button" href={`mailto:${profile.email}?subject=Let's%20connect`}>Let's talk <Send size={16}/></a>
          <div className="contact-links">
            <a href={`mailto:${profile.email}`}><Mail size={17}/>{profile.email}<ArrowUpRight size={14}/></a>
            <a href={`tel:${profile.phone.replaceAll(' ', '')}`}><Phone size={17}/>{profile.phone}<ArrowUpRight size={14}/></a>
            <a href={profile.linkedin} target="_blank" rel="noreferrer"><Linkedin size={17}/>LinkedIn<ArrowUpRight size={14}/></a>
          </div>
        </div>
      </section>
    </main>
    <footer className="footer container"><a className="brand" href="#top"><span className="brand-mark">P<span>.</span></span></a><span>DESIGNED & BUILT WITH INTENTION · © {new Date().getFullYear()} PURUSHOTHAMAN SENTHILKUMAR</span><a href="#top" className="back-top">BACK TO TOP ↑</a></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
