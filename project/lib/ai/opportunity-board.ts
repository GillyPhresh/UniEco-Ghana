// Issuer notices, not feed headlines. Date-only deadlines have no advertised closing hour.
const notices = [
  {scope:'Ghana',issuer:'KNUST · WACH',title:'MPhil fellowships in climate change, health and policy',detail:'A research fellowship for graduates with relevant backgrounds. The official call lists the documents to submit together as one PDF.',deadline:'6 Dec 2026 · 23:59 GMT',until:'2026-12-06T23:59:00Z',url:'https://www.knust.edu.gh/announcements/general/call-applications-scholarships-mphil-opportunities-climate-change-health-and-policy'},
  {scope:'Ghana',issuer:'KNUST',title:'Educational Pathways International scholarship',detail:'For eligible Ghanaian first- and second-year KNUST students. Complete the online form and submit the required documents.',deadline:'27 Nov 2026',until:'2026-11-28T00:00:00Z',url:'https://www.knust.edu.gh/announcements/general/call-applications-educational-pathways-international-epi-scholarship-20262027-academic-year'},
  {scope:'Ghana',issuer:'GETFund',title:'Local undergraduate and postgraduate scholarships',detail:'Read the official call for the 2026/27 intake and check the requirements for your level of study.',deadline:'27 Nov 2026',until:'2026-11-28T00:00:00Z',url:'https://www.getfund.gov.gh/news/getfund-opens-applications-for-2026-27-undergraduate-and-postgraduate-local-scholarships'},
  {scope:'Abroad',issuer:'Commonwealth Scholarship Commission',title:'Commonwealth Shared Scholarships · UK master’s',detail:'Choose an eligible course and apply to both the Commission and the participating university.',deadline:'8 Dec 2026 · 16:00 GMT',until:'2026-12-08T16:00:00Z',url:'https://cscuk.fcdo.gov.uk/scholarships/commonwealth-shared-scholarships-applications/'},
];
export function openOpportunities(now:number) { return notices.filter(n=>Date.parse(n.until)>now); }
export const directories = [
  {label:'Jobs in Ghana',issuer:'Ghana Labour Market Information System',url:'https://www.glmis.gov.gh/'},
  {label:'Volunteer at home or abroad',issuer:'United Nations Volunteers',url:'https://www.unv.org/become-volunteer'},
  {label:'Scholarships abroad',issuer:'Commonwealth Scholarship Commission',url:'https://cscuk.fcdo.gov.uk/scholarships/'},
];
