// Single source of truth for all portfolio content.
// Everything here comes from the resume (as captured in the v1 portfolio). Do not add unverified claims.

export const profile = {
  name: 'Purushothaman Senthilkumar',
  firstName: 'Purushothaman',
  lastName: 'Senthilkumar',
  role: 'Full Stack Software Engineer',
  location: 'Chennai, Tamil Nadu, India',
  coords: "13.08° N — 80.27° E",
  email: 'purusoth042001@gmail.com',
  phone: '+91 99659 91405',
  linkedin: 'https://linkedin.com/in/purushothaman-senthilkumar',
  experience: '2+ years',
  summary:
    'Full Stack Software Engineer with 2+ years of experience building production software at OctoGenie. Primary work is Just4Lawyer, a multi-tenant legal-practice platform shipped as a React web application and a Flutter mobile app on a Node.js and MongoDB API. Delivered practice management, payments, document editing and OCR, and automated case tracking across Indian court portals. Also built eSign & Aadhaar eSign as a separate signing product, and OctoGenie Office, an in-house suite for Word, PDF, spreadsheet and presentation editing.',
};

export const stats = [
  { value: 2, suffix: '+', label: 'Years building production software' },
  { value: 500, prefix: '~', label: 'Commits to the Just4Lawyer platform' },
  { value: 6, label: 'Products & applications shipped' },
  { value: 2, label: 'Companies — OctoGenie & Innoviti' },
] as const;

export type SkillCategory = 'Frontend' | 'Backend' | 'Databases' | 'Mobile' | 'Cloud & DevOps' | 'Integrations';

export const skillGroups: { title: SkillCategory; blurb: string; items: string[] }[] = [
  { title: 'Frontend', blurb: 'Typed, componentised interfaces for web apps and editors.', items: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Tailwind CSS', 'Vite', 'TanStack Query', 'i18next'] },
  { title: 'Backend', blurb: 'APIs, realtime services, auth and automation.', items: ['Node.js', 'Express.js', 'REST APIs', 'Socket.IO', 'JWT', 'Fastify', 'Java', 'Spring Boot', 'Python', 'Playwright'] },
  { title: 'Databases', blurb: 'Document, relational and on-device storage.', items: ['MongoDB', 'Mongoose', 'MySQL', 'SQL', 'SQLite', 'Hive'] },
  { title: 'Mobile', blurb: 'Flutter apps that keep working offline.', items: ['Flutter', 'Dart', 'Riverpod', 'go_router', 'Dio', 'Offline-first sync', 'Firebase Cloud Messaging'] },
  { title: 'Cloud & DevOps', blurb: 'Shipping and running production services.', items: ['AWS S3', 'CloudFront', 'Firebase Authentication', 'Docker', 'Nginx', 'PM2', 'GitHub Actions'] },
  { title: 'Integrations', blurb: 'Payments, messaging, documents and signatures.', items: ['Cashfree', 'Razorpay', 'PhonePe', 'WhatsApp Business API', 'ONLYOFFICE', 'Aadhaar eSign', 'Tesseract.js', 'PDF.js'] },
];

export type ProjectVisualKind = 'lawyer' | 'draft' | 'courts' | 'esign' | 'office' | 'feedback';
export type ProjectCategory = 'Legal Tech' | 'Documents' | 'Automation' | 'Productivity';

export interface Project {
  number: string;
  title: string;
  tagline: string;
  type: string;
  category: ProjectCategory;
  description: string;
  highlights: string[];
  details: string[];
  stack: string[];
  visual: ProjectVisualKind;
  accent: string;
}

export const projects: Project[] = [
  {
    number: '01',
    title: 'Just4Lawyer',
    tagline: 'Legal Practice Management SaaS',
    type: 'Web + Mobile · Multi-tenant SaaS',
    category: 'Legal Tech',
    description:
      'Multi-tenant legal-practice SaaS for Indian law firms. Built across React web, Flutter mobile and a shared Node.js API, covering cases, matters, documents, approvals, billing and reporting.',
    highlights: ['Firm-scoped workflows and permissions', 'Offline-first mobile sync and document scanning with OCR', 'Payments, calendars, notifications and custom reports'],
    details: [
      'Practice-management modules for matters, cases, clients, leads, tasks, hearings, invoices, expenses, retainers, custom fields, web forms and reports.',
      'Role-based permissions, invitations, email OTP, TOTP two-factor authentication, login lockout and verified password reset.',
      'Payment integrations with Cashfree, Razorpay and PhonePe, plus Google, Microsoft and Apple calendar sync.',
      'Flutter mobile app with offline-first sync and document scanning with OCR.',
      'Nearly 500 commits across the React/TypeScript web app, Express/MongoDB APIs and Flutter mobile.',
    ],
    stack: ['React', 'TypeScript', 'Node.js', 'Express', 'MongoDB', 'Flutter', 'Dart', 'AWS'],
    visual: 'lawyer',
    accent: '#d4b98a',
  },
  {
    number: '02',
    title: 'EZ-Draft',
    tagline: 'Document Editing & OCR',
    type: 'Documents · OCR',
    category: 'Documents',
    description:
      'Document upload, preview, editing and review for Word, PDF and text files, integrated into the legal-practice platform.',
    highlights: ['ONLYOFFICE integration with JWT-secured file serving', 'Document-to-PDF conversion and OCR digitization', 'Version history, annotations and AI-assisted drafting'],
    details: [
      'ONLYOFFICE Docs integration with JWT-secured file serving for in-browser editing.',
      'Document-to-PDF conversion and OCR digitization of scanned files with Tesseract.js.',
      'Version history, annotations and AI-assisted drafting inside the legal platform.',
      'Files stored on AWS S3; services containerised with Docker.',
    ],
    stack: ['ONLYOFFICE Docs', 'Node.js', 'Express', 'Tesseract.js', 'AWS S3', 'Docker'],
    visual: 'draft',
    accent: '#c9ccd3',
  },
  {
    number: '03',
    title: 'eCourts',
    tagline: 'Automated Case Tracking',
    type: 'Automation · Indian Court Portals',
    category: 'Automation',
    description:
      'Automated case-status tracking for District Court, High Court and Supreme Court portals, including case import and daily hearing updates.',
    highlights: ['Supreme Court scraper with CNR search', 'High Court CNR routing and scheduled sync', 'Daily hearing-summary emails and WhatsApp notifications'],
    details: [
      'Case-status tracking across District Court, High Court and Supreme Court portals.',
      'Supreme Court scraper with CNR search, built with Python and Playwright.',
      'High Court CNR routing with scheduled sync via cron jobs.',
      'Daily hearing-summary emails (Resend) and WhatsApp notifications.',
    ],
    stack: ['Python', 'Playwright', 'Node.js', 'MongoDB', 'Cron jobs', 'Resend'],
    visual: 'courts',
    accent: '#a9bcd6',
  },
  {
    number: '04',
    title: 'eSign & Aadhaar eSign',
    tagline: 'Electronic Signature Platform',
    type: 'Standalone signing product',
    category: 'Documents',
    description:
      'Standalone electronic-signature product for legal PDFs, supporting multiple signers, placed signature fields and Aadhaar eSign.',
    highlights: ['Click-to-place signature fields on PDF pages', 'Signer-specific field colors and PDF coordinate mapping', 'Aadhaar eSign workflow and audit-trail PDF generation'],
    details: [
      'Click-to-place signature fields on PDF pages rendered with PDF.js.',
      'Signer-specific field colors and mapping between screen and PDF coordinates.',
      'Multiple signers per document.',
      'Aadhaar eSign workflow and audit-trail PDF generation.',
    ],
    stack: ['React', 'TypeScript', 'PDF.js', 'Node.js', 'Express', 'MongoDB', 'AWS S3'],
    visual: 'esign',
    accent: '#e6cfa4',
  },
  {
    number: '05',
    title: 'OctoGenie Office',
    tagline: 'Office Productivity Suite',
    type: 'Docs · Sheets · Slides · PDF',
    category: 'Productivity',
    description:
      'In-house office suite for documents, spreadsheets, presentations and PDFs, embedded into the legal platform for preview, editing and review.',
    highlights: ['Word editor with paged layout, styles, tables, headers and footers', 'PDF annotations, form filling and page operations', 'Spreadsheet and presentation import/export with autosave and revision history'],
    details: [
      'Word editor with paged layout, styles, tables, headers and footers (Tiptap).',
      'PDF annotations, form filling and page operations (PDF.js, pdf-lib).',
      'Spreadsheet and presentation import/export (Univer) with autosave and revision history.',
      'Embedded into the legal platform for preview, editing and review; Fastify backend.',
    ],
    stack: ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Tiptap', 'PDF.js', 'pdf-lib', 'Univer', 'Fastify'],
    visual: 'office',
    accent: '#b9b2ff',
  },
  {
    number: '06',
    title: 'WhatsApp Customer Feedback',
    tagline: 'Salesforce Integration',
    type: 'Salesforce · Customer Experience',
    category: 'Automation',
    description:
      'Automated customer feedback collection and conversation workflows, turning responses into business insights and reducing manual follow-up and data-entry errors.',
    highlights: ['WhatsApp feedback conversations', 'Genie Bonus application integration', 'Store bonus system development and testing'],
    details: [
      'Built at Innoviti Technologies as a Salesforce Developer.',
      'WhatsApp Customer Feedback application to automate feedback collection and reduce manual follow-up and data-entry errors.',
      'Integrated the Genie Bonus application with WhatsApp.',
      'Developed and tested the store bonus system using Apex, Lightning Web Components, Batch Apex and Queueable Apex.',
    ],
    stack: ['Salesforce', 'Apex', 'Lightning Web Components', 'Batch Apex', 'Queueable Apex', 'WhatsApp'],
    visual: 'feedback',
    accent: '#b8d4c8',
  },
];

export const projectFilters = ['All', 'Legal Tech', 'Documents', 'Automation', 'Productivity'] as const;
export type ProjectFilter = (typeof projectFilters)[number];

export const experience = [
  {
    company: 'OctoGenie Private Limited',
    role: 'Software Engineer — Full Stack',
    period: '2024 — Present',
    location: 'India',
    current: true,
    summary: 'Product engineering for Just4Lawyer, a multi-tenant legal-practice SaaS used by law firms, plus eSign, eCourts, EZ-Draft and OctoGenie Office.',
    points: [
      'Developed features across React and TypeScript web, Express and MongoDB APIs, and Flutter mobile; contributed nearly 500 commits.',
      'Built practice-management modules for matters, cases, clients, leads, tasks, hearings, invoices, expenses, retainers, custom fields, web forms and reports.',
      'Implemented role-based permissions, invitations, email OTP, TOTP two-factor authentication, login lockout and verified password reset.',
      'Integrated Cashfree, Razorpay and PhonePe, plus Google, Microsoft and Apple calendars.',
      'Supported production services using Docker, Nginx, PM2, AWS S3, CloudFront and GitHub Actions.',
    ],
    tags: ['React', 'TypeScript', 'Node.js', 'MongoDB', 'Flutter', 'AWS'],
  },
  {
    company: 'Innoviti Technologies Pvt. Ltd.',
    role: 'Salesforce Developer',
    period: 'Apr 2023 — Oct 2023',
    location: 'Chennai, India',
    current: false,
    summary: 'Developed product features in Java and Salesforce, including Apex, Lightning Web Components, Batch Apex and Queueable Apex.',
    points: [
      'Built a WhatsApp Customer Feedback application to automate feedback collection and reduce manual follow-up and data-entry errors.',
      'Integrated the Genie Bonus application with WhatsApp and developed and tested the store bonus system.',
    ],
    tags: ['Salesforce', 'Apex', 'LWC', 'Java', 'WhatsApp'],
  },
];

export const education = [
  { title: 'Bachelor of Science in Computer Science', school: 'Jamal Mohamed College, Bharathidasan University, Trichy', year: '2022', note: 'CGPA 6.9' },
  { title: 'Higher Secondary — Computer Science', school: 'Boys Higher Secondary School, Srirangam, Trichy', year: '2019', note: '' },
  { title: 'Secondary School', school: 'SVM Matric Higher Secondary School, Trichy', year: '2017', note: '79%' },
];

export const certification = { title: 'Java Full Stack Development', issuer: 'Payilagam, Chennai' };

export const navLinks = [
  { id: 'about', label: 'About' },
  { id: 'experience', label: 'Experience' },
  { id: 'skills', label: 'Skills' },
  { id: 'projects', label: 'Projects' },
  { id: 'education', label: 'Education' },
  { id: 'contact', label: 'Contact' },
] as const;
