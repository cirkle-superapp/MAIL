import { db } from '@/lib/db'

async function main() {
  const ads = [
    { advertiser: 'Acme Cloud', headline: 'Acme Cloud — Free $300 credit for new accounts', displayUrl: 'acme.cloud/free', targetUrl: 'https://acme.cloud/free', snippet: 'Deploy in 30 seconds. Free $300 credit. No credit card required. Trusted by 50,000 developers.', keywords: ['cloud','hosting','server','deploy','devops'], whyAdReason: 'You searched for terms related to cloud hosting, and Acme Cloud is currently running a developer promotion.' },
    { advertiser: 'NordVPN', headline: 'NordVPN — 72% off + 3 months free', displayUrl: 'nordvpn.com', targetUrl: 'https://nordvpn.com', snippet: 'Stay private online. Military-grade encryption, 5400+ servers worldwide. 30-day money-back guarantee.', keywords: ['vpn','privacy','security','encryption','network'], whyAdReason: 'Your search touched on privacy/online security topics, which NordVPN targets in its current campaign.' },
    { advertiser: 'Coursera', headline: 'Coursera Plus — Learn data science online', displayUrl: 'coursera.org', targetUrl: 'https://coursera.org', snippet: 'Master data science with courses from Google, IBM and Stanford. Start your 7-day free trial today.', keywords: ['course','learning','data','python','ml','ai','machine','study','school'], whyAdReason: 'You searched for educational content. Coursera is bidding on learning-related keywords.' },
    { advertiser: 'Linear', headline: 'Linear — The issue tracker you will enjoy using', displayUrl: 'linear.app', targetUrl: 'https://linear.app', snippet: 'Built for high-performance software teams. Fast, keyboard-first, beautifully designed. Free for teams up to 250.', keywords: ['issue','tracker','project','team','task','jira','kanban'], whyAdReason: 'Your query matched project-management keywords that Linear is currently bidding on.' },
    { advertiser: 'Notion', headline: 'Notion — One workspace. Every team.', displayUrl: 'notion.so', targetUrl: 'https://notion.so', snippet: 'Docs, wikis, projects, databases — all in one place. Free for personal use. Try Notion AI today.', keywords: ['notes','wiki','documentation','knowledge','docs','team'], whyAdReason: 'You searched for productivity/knowledge-management terms that Notion currently targets.' },
  ]
  for (const ad of ads) {
    await db.sponsoredAd.create({ data: { ...ad, keywords: JSON.stringify(ad.keywords), active: true } }).catch(() => {})
  }
  const count = await db.sponsoredAd.count()
  console.log('sponsored ads in db:', count)
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
