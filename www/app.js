
(function(){
const $=s=>document.querySelector(s);
const BRK='Breakage / damaged';
const FORMS={buy:{col:'purchases',form:'#fBuy',title:'#fBuyTitle',newT:'Record a purchase',editT:'Edit purchase'},
  sell:{col:'sales',form:'#fSell',title:'#fSellTitle',newT:'Record a sale',editT:'Edit sale'},
  inv:{col:'investments',form:'#fInv',title:'#fInvTitle',newT:'Record money in or out',editT:'Edit entry'},
  exp:{col:'expenses',form:'#fExp',title:'#fExpTitle',newT:'Record an expense',editT:'Edit expense'}};
const S={purchases:[],sales:[],investments:[],expenses:[],invoices:[]};
const NCOL=Object.keys(S).length;
const loaded=new Set();
let db=null, sb=null, canWrite=true, period='all';
const editing={};

const pad=n=>String(n).padStart(2,'0');
const isoOf=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>isoOf(new Date());
const inr=n=>(n<0?'−':'')+'₹'+Math.round(Math.abs(n)).toLocaleString('en-IN');
const inr2=n=>'₹'+(Math.round(n*100)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=n=>Math.round(n).toLocaleString('en-IN');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate=d=>{if(!d)return'';const [y,m,dd]=d.split('-');return +dd+' '+MON[+m-1]+(y!==String(new Date().getFullYear())?' '+y:'')};
const sum=(a,f)=>a.reduce((s,r)=>s+(+r[f]||0),0);
const isBrk=r=>r.category===BRK;

function inPeriod(d){
  if(period==='all')return true;
  if(!d)return false;
  if(period==='month')return d.slice(0,7)===today().slice(0,7);
  const t=new Date();t.setDate(t.getDate()-29);return d>=isoOf(t);
}
const periodLabel=()=>({all:'all time',month:'this month','30':'last 30 days'})[period];

function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2400)}

/* ---------- calculations ---------- */
function calc(all){
  const keep=all?()=>true:r=>inPeriod(r.date);
  const P=S.purchases,Sa=S.sales,I=S.investments,E=S.expenses;
  const bEggs=sum(P,'eggs'),bCost=sum(P,'cost'),avg=bEggs?bCost/bEggs:0;
  const brokenAll=sum(E.filter(isBrk),'eggs');
  const stock=bEggs-sum(Sa,'eggs')-brokenAll;
  const collected=sum(Sa,'paid'),supPaid=sum(P,'paid');
  const expCashAll=sum(E.filter(r=>!isBrk(r)),'amount');
  const invIn=sum(I.filter(r=>r.kind!=='out'),'amount'),invOut=sum(I.filter(r=>r.kind==='out'),'amount');
  const pP=P.filter(keep),pS=Sa.filter(keep),pE=E.filter(keep);
  const rev=sum(pS,'amount'),sold=sum(pS,'eggs'),bought=sum(pP,'eggs'),boughtCost=sum(pP,'cost');
  const exp=sum(pE.filter(r=>!isBrk(r)),'amount'),broken=sum(pE.filter(isBrk),'eggs');
  const cogs=sold*avg,loss=broken*avg,profit=rev-cogs-exp-loss;
  const sellers={};Sa.forEach(r=>{const k=r.seller||'—';(sellers[k]??={amt:0,paid:0,last:''});sellers[k].amt+=+r.amount||0;sellers[k].paid+=+r.paid||0;if(r.date>sellers[k].last)sellers[k].last=r.date});
  const sups={};P.forEach(r=>{const k=r.supplier||'—';(sups[k]??={amt:0,paid:0});sups[k].amt+=+r.cost||0;sups[k].paid+=+r.paid||0});
  const partners={};I.forEach(r=>{const k=r.partner||'—';(partners[k]??={in:0,out:0});partners[k][r.kind==='out'?'out':'in']+=+r.amount||0});
  return {avg,stock,cash:invIn-invOut+collected-supPaid-expCashAll,invNet:invIn-invOut,invIn,invOut,
    rev,sold,bought,boughtCost,exp,broken,cogs,loss,profit,sellers,sups,partners,
    due:sum(Sa,'amount')-collected,pay:bCost-supPaid,sellPerEgg:sold?rev/sold:0,count:{s:pS.length,p:pP.length}};
}

/* ---------- render ---------- */
function render(){
  const total=S.purchases.length+S.sales.length+S.investments.length+S.expenses.length;
  const allLoaded=loaded.size===NCOL;
  $('#welcome').hidden=!(allLoaded&&total===0);
  $('#ovBody').hidden=allLoaded&&total===0;
  const c=calc(false),A=calc(true);

  // stock
  $('#stockBig').textContent=num(c.stock);
  $('#stockUnit').textContent='eggs in stock · '+(Math.floor(Math.max(c.stock,0)/30))+' trays'+(c.stock%30>0?' + '+(c.stock%30):'')+(c.avg?' · worth '+inr(Math.max(c.stock,0)*c.avg):'');
  const ch=$('#stockChip');
  if(c.stock<0){ch.className='chip bad';ch.textContent='Sold more than bought — check entries'}
  else if(c.stock<300){ch.className='chip warn';ch.textContent='Low stock — under 10 trays'}
  else{ch.className='chip good';ch.textContent='Stock OK'}

  const pl=periodLabel();
  $('#kRev').textContent=inr(c.rev);$('#kRevSub').textContent=c.count.s+' orders · '+pl;
  const kp=$('#kProfit');kp.textContent=inr(c.profit);kp.classList.toggle('neg',c.profit<0);
  $('#kProfitSub').textContent=c.rev?Math.round(c.profit/c.rev*100)+'% margin · '+pl:pl;
  const kc=$('#kCash');kc.textContent=inr(c.cash);kc.classList.toggle('neg',c.cash<0);
  $('#kInv').textContent=inr(c.invNet);$('#kInvSub').textContent=(k=>k+(k===1?' person':' people'))(Object.keys(c.partners).length)+(c.invOut?' · '+inr(c.invOut)+' paid out':'');
  $('#kBought').textContent=num(c.bought);$('#kBoughtSub').textContent=inr(c.boughtCost)+' · '+pl;
  $('#kSold').textContent=num(c.sold);$('#kSoldSub').textContent=Math.round(c.sold/30)+' trays · '+pl;
  $('#kDue').textContent=inr(c.due);$('#kPay').textContent=inr(c.pay);

  renderChart();

  // dues
  const dues=Object.entries(c.sellers).map(([n,v])=>({n,due:v.amt-v.paid,amt:v.amt,last:v.last})).filter(x=>x.due>0.5).sort((a,b)=>b.due-a.due);
  $('#dueCount').textContent=dues.length?dues.length+' owe money':'';
  $('#dueList').innerHTML=dues.length?dues.map(d=>`<div class="row"><div><div class="name">${esc(d.n)}</div><div class="meta">last order ${fmtDate(d.last)} · ${inr(d.amt)} total</div></div><span class="chip ${d.due>5000?'bad':'warn'}">${inr(d.due)} due</span></div>`).join(''):'<div class="empty">All sellers are paid up.</div>';

  // partners
  const parHTML=partnerRows(A);
  $('#ovPartners').innerHTML=parHTML;$('#parList').innerHTML=parHTML;

  // per egg
  $('#pegPeriod').textContent=pl;
  const margin=c.sellPerEgg-c.avg;
  $('#perEgg').innerHTML=`
    <div class="row"><div class="name">Buying cost</div><b>${inr2(c.avg)}</b></div>
    <div class="row"><div class="name">Selling price</div><b>${c.sellPerEgg?inr2(c.sellPerEgg):'—'}</b></div>
    <div class="row"><div><div class="name">Margin per egg</div><div class="meta">before expenses</div></div><span class="chip ${margin>0?'good':'bad'}">${c.sellPerEgg?inr2(margin):'—'}</span></div>
    <div class="row"><div><div class="name">Expenses</div><div class="meta">${c.broken?num(c.broken)+' eggs broken ('+inr(c.loss)+')':'no breakage logged'}</div></div><b>${inr(c.exp+c.loss)}</b></div>
    <div class="row"><div class="name">MRP check</div><span class="meta">₹20/egg on both packs</span></div>`;

  renderTables(c);
  lists();
  if(typeof renderInvoices==='function')renderInvoices();
}

function partnerRows(A){
  const ps=Object.entries(A.partners).map(([n,v])=>({n,net:v.in-v.out,in:v.in,out:v.out})).sort((a,b)=>b.net-a.net);
  const tot=ps.reduce((s,p)=>s+Math.max(p.net,0),0);
  if(!ps.length)return '<div class="empty">No investments recorded yet.</div>';
  return ps.map(p=>{const sh=tot?Math.max(p.net,0)/tot:0;return `<div class="row" style="flex-direction:column;align-items:stretch;gap:0"><div style="display:flex;justify-content:space-between;gap:10px"><div class="name">${esc(p.n)}</div><div><b>${inr(p.net)}</b> <span class="meta">· ${Math.round(sh*100)}%</span></div></div><div class="bar"><b style="width:${(sh*100).toFixed(1)}%"></b></div><div class="meta" style="margin-top:4px">Profit share so far: ${inr(A.profit*sh)}${p.out?' · withdrew '+inr(p.out):''}</div></div>`}).join('');
}

function renderChart(){
  const now=new Date(),months=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(d.getFullYear()+'-'+pad(d.getMonth()+1))}
  const b=months.map(m=>sum(S.purchases.filter(r=>(r.date||'').startsWith(m)),'eggs'));
  const s=months.map(m=>sum(S.sales.filter(r=>(r.date||'').startsWith(m)),'eggs'));
  const mx=Math.max(...b,...s,1);
  const step=niceStep(mx/4),top=Math.ceil(mx/step)*step;
  const W=600,H=230,L=52,R=10,T=12,B=30,cw=(W-L-R)/6,bw=Math.min(28,cw*0.32);
  const y=v=>T+(H-T-B)*(1-v/top);
  let g='';
  for(let v=0;v<=top+1e-9;v+=step){g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)">${v>=1000?(v/1000)+'k':v}</text>`}
  months.forEach((m,i)=>{const cx=L+cw*i+cw/2;
    g+=`<rect x="${cx-bw-2}" y="${y(b[i])}" width="${bw}" height="${Math.max(y(0)-y(b[i]),0)}" rx="3" fill="var(--soil)"><title>${num(b[i])} eggs bought</title></rect>`;
    g+=`<rect x="${cx+2}" y="${y(s[i])}" width="${bw}" height="${Math.max(y(0)-y(s[i]),0)}" rx="3" fill="var(--yolk)"><title>${num(s[i])} eggs sold</title></rect>`;
    g+=`<text x="${cx}" y="${H-10}" text-anchor="middle" font-size="12" fill="${i===5?'var(--ink)':'var(--muted)'}" font-weight="${i===5?600:400}">${MON[+m.slice(5)-1]}</text>`});
  $('#chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Eggs bought and sold per month">${g}</svg>`;
}
function niceStep(x){const p=Math.pow(10,Math.floor(Math.log10(x)));const f=x/p;return (f<=1?1:f<=2?2:f<=5?5:10)*p}

function statusChip(amt,paid){const due=amt-paid;if(due<=0.5)return '<span class="chip good">Paid</span>';if(paid<=0)return `<span class="chip bad">${inr(due)} due</span>`;return `<span class="chip warn">${inr(due)} due</span>`}
const exTag=r=>r.sample?'<span class="ex">EXAMPLE</span>':'';
const editBtn=(k,id)=>canWrite?`<button class="link" type="button" data-edit="${k}" data-id="${esc(id)}">Edit</button>`:'';
const byDate=a=>a.slice().sort((x,y)=>(y.date||'').localeCompare(x.date||'')||((y.t||0)-(x.t||0)));

function renderTables(c){
  const P=byDate(S.purchases.filter(r=>inPeriod(r.date)));
  $('#tBuy').innerHTML=P.length?P.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${esc(r.supplier)}${exTag(r)}</td><td class="num">${num(r.eggs)}<div class="s">${r.eggs%30===0?r.eggs/30+' trays':''}</div></td><td class="num">${inr2(r.eggs?r.cost/r.eggs:0)}</td><td class="num">${inr(r.cost)}</td><td class="num">${inr(r.paid)}</td><td>${statusChip(r.cost,r.paid)}</td><td>${editBtn('buy',r.id)}</td></tr>`).join(''):`<tr><td colspan="8" class="empty" style="padding:16px 12px">No purchases ${period==='all'?'yet':periodLabel()}. Add one with the form.</td></tr>`;
  $('#buySum').textContent=P.length?num(sum(P,'eggs'))+' eggs · '+inr(sum(P,'cost'))+' · '+periodLabel():'';

  const Sa=byDate(S.sales.filter(r=>inPeriod(r.date)));
  const packName=p=>p==='loose'?'Loose':p+'-pack';
  $('#tSell').innerHTML=Sa.length?Sa.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${esc(r.seller)}${exTag(r)}</td><td>${packName(r.pack)}</td><td class="num">${num(r.qty)}<div class="s">@ ${inr2(r.rate)}</div></td><td class="num">${num(r.eggs)}</td><td class="num">${inr(r.amount)}</td><td class="num">${inr(r.paid)}</td><td>${statusChip(r.amount,r.paid)}</td><td>${r.invoiceNo?`<button class="link" type="button" data-viewinv="${esc(r.invoiceNo)}">${esc(r.invoiceNo)}</button>`:(canWrite?`<button class="link" type="button" data-bill="${esc(r.id)}">Make bill</button>`:'—')}</td><td>${editBtn('sell',r.id)}</td></tr>`).join(''):`<tr><td colspan="10" class="empty" style="padding:16px 12px">No sales ${period==='all'?'yet':periodLabel()}. Add one with the form.</td></tr>`;
  $('#sellSum').textContent=Sa.length?num(sum(Sa,'eggs'))+' eggs · '+inr(sum(Sa,'amount'))+' · '+periodLabel():'';

  const I=byDate(S.investments);
  $('#tInv').innerHTML=I.length?I.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${esc(r.partner)}${exTag(r)}</td><td>${r.kind==='out'?'<span class="chip plain">Withdrew</span>':'<span class="chip good">Invested</span>'}</td><td class="num">${inr(r.amount)}</td><td>${esc(r.note)}</td><td>${editBtn('inv',r.id)}</td></tr>`).join(''):'<tr><td colspan="6" class="empty" style="padding:16px 12px">No capital entries yet.</td></tr>';
  $('#invSum').textContent=I.length?inr(c.invNet)+' net · all time':'';

  const E=byDate(S.expenses.filter(r=>inPeriod(r.date)));
  $('#tExp').innerHTML=E.length?E.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${esc(r.category)}${exTag(r)}</td><td class="num">${isBrk(r)?num(r.eggs)+' eggs<div class="s">≈ '+inr(r.eggs*c.avg)+'</div>':inr(r.amount)}</td><td>${esc(r.note)}</td><td>${editBtn('exp',r.id)}</td></tr>`).join(''):`<tr><td colspan="5" class="empty" style="padding:16px 12px">No expenses ${period==='all'?'yet':periodLabel()}.</td></tr>`;
  $('#expSum').textContent=E.length?inr(sum(E.filter(r=>!isBrk(r)),'amount'))+' spent · '+periodLabel():'';
}

function lists(){
  const fill=(id,arr)=>{$(id).innerHTML=[...new Set(arr.filter(Boolean))].map(v=>`<option value="${esc(v)}">`).join('')};
  fill('#dl_sup',S.purchases.map(r=>r.supplier));fill('#dl_sel',S.sales.map(r=>r.seller));fill('#dl_par',S.investments.map(r=>r.partner));
}

/* ---------- tabs & period ---------- */
function showTab(t){
  document.querySelectorAll('button[data-t]').forEach(b=>b.setAttribute('aria-selected',b.dataset.t===t));
  document.querySelectorAll('section.panel').forEach(p=>p.hidden=p.id!=='p-'+t);
  try{localStorage.setItem('se_tab',t)}catch(e){}
  window.scrollTo({top:0});
}
document.querySelectorAll('button[data-t]').forEach(b=>b.onclick=()=>showTab(b.dataset.t));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showTab(b.dataset.go));
document.querySelectorAll('.period button').forEach(b=>b.onclick=()=>{period=b.dataset.p;document.querySelectorAll('.period button').forEach(x=>x.setAttribute('aria-pressed',x===b));render()});

/* ---------- form helpers ---------- */
const v=id=>$(id).value.trim();
const n=id=>{const x=$(id).value;return x===''?null:+x};
function previews(){
  const q=n('#b_qty')||0,r=n('#b_rate')||0,u=$('#b_unit').value;
  $('#b_rateL').textContent=u==='tray'?'₹ per tray':'₹ per egg';
  const eggs=u==='tray'?q*30:q,cost=q*r;
  $('#b_prev').textContent=q&&r?`${num(eggs)} eggs · ${inr(cost)} total · ${inr2(eggs?cost/eggs:0)} per egg`:'Enter quantity and rate';
  const p=$('#s_pack').value,sq=n('#s_qty')||0,sr=n('#s_rate')||0;
  $('#s_qtyL').textContent=p==='loose'?'Eggs':'Packs';
  $('#s_rateL').textContent=p==='loose'?'₹ per egg':'₹ per pack';
  $('#s_rate').placeholder=p==='12'?'MRP 240':p==='30'?'MRP 600':'MRP 20';
  const se=p==='loose'?sq:sq*+p;
  $('#s_prev').textContent=sq&&sr?`${num(se)} eggs · ${inr(sq*sr)} · ${inr2(sr/(p==='loose'?1:+p))} per egg`:'MRP: ₹240 per 12-pack · ₹600 per 30-pack';
  const brk=$('#e_cat').value===BRK;$('#e_amtF').hidden=brk;$('#e_eggF').hidden=!brk;
  const be=n('#e_eggs')||0,avg=calc(true).avg;
  $('#e_prev').hidden=!(brk&&be&&avg);$('#e_prev').textContent=`Counted as a loss of about ${inr(be*avg)} at ${inr2(avg)} per egg, and taken out of stock.`;
}
['#b_qty','#b_rate','#b_unit','#s_pack','#s_qty','#s_rate','#e_cat','#e_eggs'].forEach(s=>$(s).addEventListener('input',previews));

function resetForm(k){
  const F=FORMS[k];$(F.form).reset();editing[k]=null;$(F.title).textContent=F.newT;
  document.querySelectorAll(`[data-cancel="${k}"],[data-del="${k}"]`).forEach(b=>{b.hidden=true;b.textContent=b.dataset.del?'Delete':'Cancel'});
  ['#b_date','#s_date','#i_date','#e_date'].forEach(s=>{if(!$(s).value)$(s).value=today()});
  if(k==='sell'){$('#s_autoW').hidden=false;$('#s_auto').checked=autoPref();phoneAuto=true;sellLabel()}
  previews();
}
let phoneAuto=true;
function autoPref(){try{return localStorage.getItem('se_auto')!=='0'}catch(e){return true}}
function sellLabel(){$('#s_submit').textContent=editing.sell?'Save changes':($('#s_auto').checked?'Save sale & make invoice':'Save sale')}
const lastInvFor=seller=>byDate(S.invoices.filter(x=>x.seller===seller))[0];
function bad(msg){toast(msg);return null}

/* ---------- sales: save, auto-invoice, keep invoice in sync ---------- */
const lineOf=r=>({saleId:r.id,date:r.date,pack:r.pack,qty:r.qty,rate:r.rate,amount:r.amount,eggs:r.eggs,paid:r.paid});
async function makeInvoice(saleIds,det){
  const lines=S.sales.filter(r=>saleIds.includes(r.id)).sort((x,y)=>(x.date||'').localeCompare(y.date||'')).map(lineOf);
  let n=+BIZ.next||1;while(S.invoices.some(x=>x.no===invNo(n)))n++;
  const no=invNo(n);
  const created=await db.insert('invoices',{no,date:det.date||today(),seller:det.seller,addr:det.addr||'',phone:det.phone||'',gstin:det.gstin||'',note:det.note||'',lines,total:sum(lines,'amount'),paid:sum(lines,'paid')});
  for(const l of lines)await db.update('sales',l.saleId,{invoiceNo:no});
  await db.saveSettings(Object.assign({},BIZ,{next:n+1}));
  return created;
}
async function syncInvoiceForSale(r){
  if(!r||!r.invoiceNo)return;
  const inv=S.invoices.find(x=>x.no===r.invoiceNo);if(!inv)return;
  const lines=inv.lines.map(l=>l.saleId===r.id?lineOf(r):l);
  const patch={lines,total:sum(lines,'amount'),paid:sum(lines,'paid')};
  if(lines.length===1)patch.seller=r.seller;
  const ph=v('#s_phone');if(ph&&ph!==inv.phone)patch.phone=ph;
  await db.update('invoices',inv.id,patch);
}
async function saveSale(id,data){
  const btn=$('#s_submit');btn.disabled=true;
  try{
    if(id){
      let row=null;
      if(await guard((async()=>{row=await db.update('sales',id,data);await syncInvoiceForSale(row)})(),row?.invoiceNo?'Sale and invoice updated':'Changes saved'))resetForm('sell');
      return;
    }
    const auto=$('#s_auto').checked,last=lastInvFor(data.seller),phone=v('#s_phone')||last?.phone||'';
    let row=null;
    if(!await guard((async()=>{row=await db.insert('sales',data)})(),auto?'Sale saved':'Sale saved'))return;
    resetForm('sell');
    if(!auto||!row)return;
    let inv=null;
    const ok=await guard((async()=>{inv=await makeInvoice([row.id],{date:row.date,seller:row.seller,phone,addr:last?.addr,gstin:last?.gstin})})(),'Invoice '+invNo(+BIZ.next||1)+' made');
    if(ok&&inv)openSheet(inv.id);
    else toast('Sale saved, but the invoice could not be made. Use Make bill on the sale to try again.');
  }finally{btn.disabled=false}
}
$('#s_auto').addEventListener('change',()=>{try{localStorage.setItem('se_auto',$('#s_auto').checked?'1':'0')}catch(e){}sellLabel()});
$('#s_seller').addEventListener('input',()=>{if(!phoneAuto&&v('#s_phone'))return;const ph=lastInvFor(v('#s_seller'))?.phone;$('#s_phone').value=ph||'';phoneAuto=true});
$('#s_phone').addEventListener('input',()=>{phoneAuto=false});

/* ---------- invoice sheet shown right after a sale ---------- */
let sheetInv=null;
function openSheet(id){
  sheetInv=id;const inv=S.invoices.find(x=>x.id===id);if(!inv)return;
  $('#sheetTitle').textContent='Invoice '+inv.no+' ready';
  $('#sheetPaper').innerHTML=paperHTML(inv);$('#sheetWa').href=waLink(inv);
  $('#invSheet').hidden=false;document.body.style.overflow='hidden';
}
function closeSheet(){$('#invSheet').hidden=true;document.body.style.overflow='';sheetInv=null}
$('#sheetClose').onclick=closeSheet;
$('#invSheet').addEventListener('click',e=>{if(e.target.id==='invSheet')closeSheet()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#invSheet').hidden)closeSheet()});
$('#sheetPdf').onclick=()=>{const inv=S.invoices.find(x=>x.id===sheetInv);if(inv)sharePdf(inv)};

function readForm(k){
  if(k==='buy'){
    const date=v('#b_date'),supplier=v('#b_sup'),q=n('#b_qty'),r=n('#b_rate'),unit=$('#b_unit').value;
    if(!date||!supplier)return bad('Add the date and supplier');
    if(!(q>0)||!(r>=0)||r===null)return bad('Enter a quantity and a rate');
    const eggs=unit==='tray'?q*30:q,cost=Math.round(q*r*100)/100,p=n('#b_paid');
    return {date,supplier,qty:q,unit,rate:r,eggs,cost,paid:p===null?cost:Math.min(p,cost),note:v('#b_note')};
  }
  if(k==='sell'){
    const date=v('#s_date'),seller=v('#s_seller'),pack=$('#s_pack').value,q=n('#s_qty'),r=n('#s_rate');
    if(!date||!seller)return bad('Add the date and seller');
    if(!(q>0)||r===null||!(r>=0))return bad('Enter quantity and price');
    const eggs=pack==='loose'?q:q*+pack,amount=Math.round(q*r*100)/100,p=n('#s_paid');
    return {date,seller,pack,qty:q,rate:r,eggs,amount,paid:p===null?amount:Math.min(p,amount),note:v('#s_note')};
  }
  if(k==='inv'){
    const date=v('#i_date'),partner=v('#i_who'),a=n('#i_amt');
    if(!date||!partner)return bad('Add the date and person');
    if(!(a>0))return bad('Enter an amount');
    return {date,partner,kind:$('#i_kind').value,amount:a,note:v('#i_note')};
  }
  if(k==='exp'){
    const date=v('#e_date'),category=$('#e_cat').value;
    if(!date)return bad('Add the date');
    if(category===BRK){const e=n('#e_eggs');if(!(e>0))return bad('Enter how many eggs');return {date,category,eggs:e,amount:0,note:v('#e_note')}}
    const a=n('#e_amt');if(!(a>0))return bad('Enter an amount');
    return {date,category,amount:a,eggs:0,note:v('#e_note')};
  }
}

function fillForm(k,r){
  if(k==='buy'){$('#b_date').value=r.date||'';$('#b_sup').value=r.supplier||'';$('#b_unit').value=r.unit||'egg';$('#b_qty').value=r.qty??r.eggs;$('#b_rate').value=r.rate??(r.eggs?r.cost/r.eggs:0);$('#b_paid').value=r.paid??'';$('#b_note').value=r.note||''}
  if(k==='sell'){$('#s_date').value=r.date||'';$('#s_seller').value=r.seller||'';$('#s_pack').value=r.pack||'12';$('#s_qty').value=r.qty;$('#s_rate').value=r.rate;$('#s_paid').value=r.paid??'';$('#s_note').value=r.note||'';
    const inv=r.invoiceNo&&S.invoices.find(x=>x.no===r.invoiceNo);$('#s_phone').value=inv?.phone||lastInvFor(r.seller)?.phone||'';$('#s_autoW').hidden=true;sellLabel()}
  if(k==='inv'){$('#i_date').value=r.date||'';$('#i_who').value=r.partner||'';$('#i_kind').value=r.kind||'in';$('#i_amt').value=r.amount;$('#i_note').value=r.note||''}
  if(k==='exp'){$('#e_date').value=r.date||'';$('#e_cat').value=r.category;$('#e_amt').value=r.amount||'';$('#e_eggs').value=r.eggs||'';$('#e_note').value=r.note||''}
  previews();
}

async function guard(p,ok){
  try{await p;toast(ok);return true}
  catch(e){
    console.error(e);
    if(e&&(e.code==='42501'||/row-level security/i.test(e.message||''))){canWrite=false;setStatus('This account can view the books but not change them. Ask the owner to add your email to the team list.');render()}
    else if(e&&e.code==='23505')toast('That invoice number is already used. Change the next number in business details.');
    else if(!navigator.onLine)toast('You are offline. Connect to the internet and try again.');
    else toast('Could not save. Check your connection and try again.');
    return false;
  }
}

Object.entries(FORMS).forEach(([k,F])=>{
  $(F.form).addEventListener('submit',async ev=>{
    ev.preventDefault();
    if(!db||!canWrite)return toast('Saving is not available in this view');
    const data=readForm(k);if(!data)return;
    const id=editing[k];
    if(k==='sell')return saveSale(id,data);
    if(id){if(await guard(db.update(F.col,id,data),'Changes saved'))resetForm(k);}
    else{if(await guard(db.insert(F.col,data),'Saved'))resetForm(k);}
  });
  document.querySelector(`[data-cancel="${k}"]`).onclick=()=>resetForm(k);
  const del=document.querySelector(`[data-del="${k}"]`);
  del.onclick=async()=>{
    if(del.textContent==='Delete'){del.textContent='Tap again to delete';return}
    const id=editing[k];if(!id)return;
    if(await guard(db.remove(F.col,id),'Deleted'))resetForm(k);
  };
});

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-edit]');if(!b)return;
  const k=b.dataset.edit,F=FORMS[k],r=S[F.col].find(x=>x.id===b.dataset.id);if(!r)return;
  editing[k]=r.id;fillForm(k,r);$(F.title).textContent=F.editT;
  document.querySelectorAll(`[data-cancel="${k}"],[data-del="${k}"]`).forEach(x=>x.hidden=false);
  $(F.form).scrollIntoView({behavior:'smooth',block:'start'});
});

/* ---------- invoices ---------- */
const DEFBIZ={name:'Star Eggs',addr:'',phone:'',gstin:'',fssai:'Applied for',upi:'',prefix:'SE-',next:1,title:'Bill of Supply'};
let BIZ=Object.assign({},DEFBIZ), dl=true, curInv=null, picked=new Set(), pickSeller=null;
const fmtLong=d=>{if(!d)return'';const [y,m,dd]=d.split('-');return +dd+' '+MON[+m-1]+' '+y};
const packLabel=p=>p==='loose'?'Brown organic eggs, loose':`Brown organic eggs, ${p}-egg pack`;
const qtyLabel=l=>l.qty+' '+(l.pack==='loose'?'egg':'pack')+(l.qty===1?'':'s');
const invNo=n=>(BIZ.prefix||'')+String(n).padStart(4,'0');
function words(num){
  num=Math.round(num);if(!num)return 'Zero';
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two=n=>n<20?a[n]:b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');
  const three=n=>(n>=100?a[Math.floor(n/100)]+' Hundred'+(n%100?' ':''):'')+(n%100?two(n%100):'');
  const out=[],cr=Math.floor(num/1e7);num%=1e7;const lk=Math.floor(num/1e5);num%=1e5;const th=Math.floor(num/1e3);num%=1e3;
  if(cr)out.push(words(cr)+' Crore');if(lk)out.push(two(lk)+' Lakh');if(th)out.push(two(th)+' Thousand');if(num)out.push(three(num));
  return out.join(' ');
}
function livePaid(inv){if(inv.draft)return inv.paid;return inv.lines.reduce((s,l)=>{const r=S.sales.find(x=>x.id===l.saleId);return s+(r?+r.paid||0:+l.paid||0)},0)}
function draftInv(){
  const lines=S.sales.filter(r=>picked.has(r.id)).sort((x,y)=>(x.date||'').localeCompare(y.date||'')).map(r=>({saleId:r.id,date:r.date,pack:r.pack,qty:r.qty,rate:r.rate,amount:r.amount,eggs:r.eggs,paid:r.paid}));
  let n=+BIZ.next||1;while(S.invoices.some(x=>x.no===invNo(n)))n++;
  return {draft:true,num:n,no:invNo(n),date:v('#v_date')||today(),seller:v('#v_seller'),addr:v('#v_addr'),phone:v('#v_phone'),gstin:v('#v_gstin'),note:v('#v_note'),lines,total:sum(lines,'amount'),paid:sum(lines,'paid')};
}
function prefillBillTo(seller){
  const last=byDate(S.invoices.filter(x=>x.seller===seller))[0];
  $('#v_addr').value=last?.addr||'';$('#v_phone').value=last?.phone||'';$('#v_gstin').value=last?.gstin||'';
}
function renderPicks(){
  const seller=v('#v_seller');
  if(seller!==pickSeller){pickSeller=seller;picked=new Set(S.sales.filter(r=>r.seller===seller&&!r.invoiceNo).map(r=>r.id));prefillBillTo(seller)}
  S.sales.forEach(r=>{if(r.invoiceNo)picked.delete(r.id)});
  const rows=byDate(S.sales.filter(r=>r.seller===seller));
  $('#v_lines').innerHTML=!seller?'<div class="empty">Pick a seller to see their orders.</div>':!rows.length?'<div class="empty">No sales recorded for this seller.</div>':
    rows.map(r=>`<label class="pick${r.invoiceNo?' billed':''}"><input type="checkbox" data-pick="${esc(r.id)}"${picked.has(r.id)?' checked':''}${r.invoiceNo?' disabled':''}><span>${fmtDate(r.date)} · ${r.pack==='loose'?'Loose':r.pack+'-pack'} × ${num(r.qty)}${r.invoiceNo?' · billed '+esc(r.invoiceNo):''}</span><b>${inr(r.amount)}</b></label>`).join('');
}
function paperHTML(inv){
  const paid=livePaid(inv),bal=inv.total-paid,exempt=/supply/i.test(BIZ.title||'');
  const info=[BIZ.phone&&'Ph '+BIZ.phone,BIZ.gstin&&'GSTIN '+BIZ.gstin,BIZ.fssai&&'FSSAI '+BIZ.fssai].filter(Boolean).map(esc).join(' · ');
  const lines=inv.lines.length?inv.lines.map((l,i)=>`<tr><td>${i+1}</td><td>${packLabel(l.pack)}<div class="s">Supplied ${fmtDate(l.date)} · ${num(l.eggs)} eggs</div></td><td>0407</td><td class="num">${qtyLabel(l)}</td><td class="num">${inr2(l.rate)}</td><td class="num">${inr2(l.amount)}</td></tr>`).join('')
    :'<tr><td colspan="6" class="s" style="padding:14px 12px">Tick orders on the left to add them.</td></tr>';
  return `<div class="paper">
  <div class="ph"><div class="pbrand"><svg width="34" height="40" viewBox="0 0 40 46" aria-hidden="true"><ellipse cx="20" cy="25" rx="17" ry="20" fill="var(--paper)" stroke="#6E4C34" stroke-width="2"/><path d="M20 15l3 6.2 6.8.9-5 4.7 1.3 6.7L20 30.3l-6.1 3.2 1.3-6.7-5-4.7 6.8-.9z" fill="#E2960F"/></svg>
    <div style="min-width:0"><div class="pname">${esc(BIZ.name||'Star Eggs')}</div>${BIZ.addr?`<div class="pm">${esc(BIZ.addr)}</div>`:''}${info?`<div class="pm">${info}</div>`:''}</div></div>
    <div class="pmeta"><div class="ptitle">${esc(BIZ.title||'Invoice')}</div><div>No. <b>${esc(inv.no)}</b>${inv.draft?' <span class="pm">(draft)</span>':''}</div><div>Date ${fmtLong(inv.date)}</div></div></div>
  <div class="pto"><div class="pl">Bill to</div><b>${esc(inv.seller||'—')}</b>${inv.addr?`<div>${esc(inv.addr)}</div>`:''}${inv.phone?`<div class="pm">Ph ${esc(inv.phone)}</div>`:''}${inv.gstin?`<div class="pm">GSTIN ${esc(inv.gstin)}</div>`:''}</div>
  <table><thead><tr><th>#</th><th>Item</th><th>HSN</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${lines}</tbody></table>
  <div class="ptot"><div><span>Total</span><span>${inr2(inv.total)}</span></div><div><span>Received</span><span>${inr2(paid)}</span></div><div class="due"><span>Balance due</span><span>${inr2(bal)}</span></div></div>
  ${inv.total?`<div class="pwords">Rupees ${words(inv.total)} only</div>`:''}
  ${exempt?'<div class="pm" style="margin-top:6px">Fresh eggs (HSN 0407) are exempt from GST.</div>':''}
  ${BIZ.upi?`<div style="margin-top:6px">Pay by UPI: <b>${esc(BIZ.upi)}</b></div>`:''}
  ${inv.note?`<div class="pm" style="margin-top:6px">Note: ${esc(inv.note)}</div>`:''}
  <div class="pfoot">Thank you for stocking Star Eggs.</div></div>`;
}
function waLink(inv){
  const paid=livePaid(inv),bal=inv.total-paid;
  const ls=inv.lines.map(l=>`• ${l.pack==='loose'?'Loose eggs':l.pack+'-egg pack'} × ${l.qty} = ${inr(l.amount)}`).join('\n');
  const t=`*${BIZ.name||'Star Eggs'}* ${BIZ.title||'Invoice'} ${inv.no}\nDate: ${fmtLong(inv.date)}\n\n${ls}\n\nTotal: ${inr(inv.total)}\nReceived: ${inr(paid)}\n*Balance due: ${inr(bal)}*${BIZ.upi?'\nPay by UPI: '+BIZ.upi:''}\n\nThank you!`;
  let ph=(inv.phone||'').replace(/\D/g,'');if(ph.length===10)ph='91'+ph;
  return 'https://wa.me/'+ph+'?text='+encodeURIComponent(t);
}
function renderInvoices(){
  renderPicks();
  let inv=curInv&&S.invoices.find(x=>x.id===curInv);
  if(!inv){curInv=null;inv=draftInv()}
  $('#invPreview').innerHTML=paperHTML(inv);
  $('#invHead').textContent=inv.draft?'Preview':inv.no;
  $('#pdfBtn').hidden=inv.draft||!dl;$('#waBtn').hidden=inv.draft;$('#invNew').hidden=inv.draft;$('#invDel').hidden=inv.draft||!canWrite;
  if(!inv.draft)$('#waBtn').href=waLink(inv);
  const I=byDate(S.invoices);
  $('#tBill').innerHTML=I.length?I.map(x=>{const p=livePaid(x);return `<tr><td><b>${esc(x.no)}</b>${exTag(x)}</td><td>${fmtDate(x.date)}</td><td>${esc(x.seller)}</td><td class="num">${inr(x.total)}</td><td>${statusChip(x.total,p)}</td><td><button class="link" type="button" data-viewinv="${esc(x.no)}">View</button></td></tr>`}).join('')
    :'<tr><td colspan="6" class="empty" style="padding:16px 12px">No invoices yet. Pick a seller, tick their orders and create one.</td></tr>';
  const due=I.reduce((s,x)=>s+x.total-livePaid(x),0);
  $('#billSum').textContent=I.length?I.length+' invoices · '+inr(due)+' unpaid':'';
}
['#v_seller','#v_date','#v_addr','#v_phone','#v_gstin','#v_note'].forEach(s=>$(s).addEventListener('input',()=>{curInv=null;renderInvoices()}));
$('#v_lines').addEventListener('change',e=>{const c=e.target.closest('[data-pick]');if(!c)return;c.checked?picked.add(c.dataset.pick):picked.delete(c.dataset.pick);curInv=null;renderInvoices()});
$('#fBill').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db||!canWrite)return toast('Saving is not available in this view');
  const d=draftInv();
  if(!d.seller)return toast('Pick a seller');
  if(!d.lines.length)return toast('Tick at least one order');
  let created=null;
  const ok=await guard((async()=>{created=await makeInvoice(d.lines.map(l=>l.saleId),d)})(),'Invoice '+d.no+' created');
  if(ok&&created){curInv=created.id;$('#v_note').value='';pickSeller=null;renderInvoices();revealInvoice()}
});
$('#invNew').onclick=()=>{curInv=null;$('#fBill').reset();$('#v_date').value=today();pickSeller=null;renderInvoices();$('#v_seller').focus()};
const invDel=$('#invDel');
invDel.onclick=async()=>{
  if(invDel.textContent==='Delete'){invDel.textContent='Tap again to delete';return}
  const inv=S.invoices.find(x=>x.id===curInv);if(!inv)return;
  const ok=await guard((async()=>{
    await db.remove('invoices',inv.id);
    for(const l of inv.lines){const r=S.sales.find(x=>x.id===l.saleId);if(r&&r.invoiceNo===inv.no)await db.update('sales',r.id,{invoiceNo:null})}
  })(),'Invoice '+inv.no+' deleted');
  invDel.textContent='Delete';if(ok){curInv=null;pickSeller=null;renderInvoices()}
};
document.addEventListener('click',e=>{
  const vb=e.target.closest('[data-viewinv]');
  if(vb){const inv=S.invoices.find(x=>x.no===vb.dataset.viewinv);if(inv){curInv=inv.id;invDel.textContent='Delete';showTab('invoices');renderInvoices();revealInvoice()}return}
  const bb=e.target.closest('[data-bill]');
  if(bb){const r=S.sales.find(x=>x.id===bb.dataset.bill);if(!r)return;curInv=null;$('#v_seller').value=r.seller;pickSeller=r.seller;picked=new Set([r.id]);prefillBillTo(r.seller);$('#v_date').value=today();showTab('invoices');renderInvoices()}
});
$('#pdfBtn').onclick=()=>{const inv=S.invoices.find(x=>x.id===curInv);if(inv)sharePdf(inv)};
const NATIVE=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
let nativePlugins=null;
function plugins(){if(!nativePlugins)nativePlugins={fs:window.Capacitor.registerPlugin('Filesystem'),share:window.Capacitor.registerPlugin('Share')};return nativePlugins}
function toBase64(buf){const b=new Uint8Array(buf);let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)}
async function sharePdf(inv){
  if(!window.jspdf){toast('PDF maker did not load. Reopen the app and try again.');return}
  const buf=makePdf(inv),name=inv.no+'.pdf',title=(BIZ.name||'Star Eggs')+' '+inv.no;
  if(NATIVE){
    try{
      const {fs,share}=plugins();
      const res=await fs.writeFile({path:name,data:toBase64(buf),directory:'CACHE'});
      await share.share({title,dialogTitle:'Send '+inv.no,files:[res.uri]});
    }catch(err){if(!/cancel/i.test(String(err&&err.message||err)))toast('Could not open sharing. Try again.')}
    return;
  }
  const file=new File([buf],name,{type:'application/pdf'});
  if(canShareFiles){
    try{await navigator.share({files:[file],title});return}
    catch(err){if(err&&err.name==='AbortError')return}
  }
  const url=URL.createObjectURL(file),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);toast('PDF saved');
}
// In the Android app, open WhatsApp links through the system so WhatsApp itself opens.
document.addEventListener('click',e=>{
  if(!NATIVE)return;const a=e.target.closest('a[href^="https://wa.me/"]');if(!a)return;
  e.preventDefault();window.location.href=a.href;
});
function makePdf(inv){
  const {jsPDF}=window.jspdf,d=new jsPDF({unit:'mm',format:'a4'}),W=210,M=16;
  const rs=n=>'Rs. '+(Math.round(n*100)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const ink=()=>d.setTextColor(44,33,24),mute=()=>d.setTextColor(118,104,91);
  const paid=livePaid(inv),bal=inv.total-paid;
  let y=18;
  d.setDrawColor(110,76,52);d.setLineWidth(.6);d.ellipse(M+6,y+3,5.5,7,'S');d.setFillColor(226,150,15);d.circle(M+6,y+4,2.6,'F');
  d.setFont('helvetica','bold');d.setFontSize(18);ink();d.text(BIZ.name||'Star Eggs',M+15,y+2);
  d.setFont('helvetica','normal');d.setFontSize(9);mute();
  let yy=y+7;
  if(BIZ.addr){const t=d.splitTextToSize(BIZ.addr,95);d.text(t,M+15,yy);yy+=t.length*4}
  const info=[BIZ.phone&&'Ph '+BIZ.phone,BIZ.gstin&&'GSTIN '+BIZ.gstin,BIZ.fssai&&'FSSAI '+BIZ.fssai].filter(Boolean).join('  |  ');
  if(info){const t=d.splitTextToSize(info,95);d.text(t,M+15,yy);yy+=t.length*4}
  d.setFont('helvetica','bold');d.setFontSize(13);ink();d.text((BIZ.title||'Invoice').toUpperCase(),W-M,y+2,{align:'right'});
  d.setFont('helvetica','normal');d.setFontSize(10);d.text('No. '+inv.no,W-M,y+8,{align:'right'});d.text('Date: '+fmtLong(inv.date),W-M,y+13,{align:'right'});
  y=Math.max(yy,y+16)+4;d.setDrawColor(227,221,210);d.setLineWidth(.3);d.line(M,y,W-M,y);y+=7;
  d.setFontSize(8);mute();d.text('BILL TO',M,y);y+=5;
  d.setFont('helvetica','bold');d.setFontSize(11);ink();d.text(inv.seller,M,y);y+=5;
  d.setFont('helvetica','normal');d.setFontSize(9);mute();
  [inv.addr,inv.phone&&'Ph '+inv.phone,inv.gstin&&'GSTIN '+inv.gstin].filter(Boolean).forEach(s=>{const t=d.splitTextToSize(s,110);d.text(t,M,y);y+=t.length*4});
  y+=5;
  const head=()=>{d.setFillColor(251,239,214);d.rect(M,y-5,W-2*M,8,'F');d.setFont('helvetica','bold');d.setFontSize(9);ink();
    d.text('#',M+2,y);d.text('Item',M+9,y);d.text('HSN',M+98,y);d.text('Qty',138,y,{align:'right'});d.text('Rate',163,y,{align:'right'});d.text('Amount',W-M-2,y,{align:'right'});y+=8};
  head();
  inv.lines.forEach((l,i)=>{
    if(y>262){d.addPage();y=20;head()}
    d.setFont('helvetica','normal');d.setFontSize(9.5);ink();
    d.text(String(i+1),M+2,y);d.text(packLabel(l.pack),M+9,y);d.text('0407',M+98,y);d.text(qtyLabel(l),138,y,{align:'right'});d.text(rs(l.rate),163,y,{align:'right'});d.text(rs(l.amount),W-M-2,y,{align:'right'});
    d.setFontSize(8);mute();d.text('Supplied '+fmtLong(l.date)+'  |  '+num(l.eggs)+' eggs',M+9,y+4);
    d.setDrawColor(227,221,210);d.line(M,y+7,W-M,y+7);y+=12;
  });
  if(y>240){d.addPage();y=20}
  y+=2;d.setFontSize(10);
  [['Total',inv.total],['Received',paid]].forEach(([k,val])=>{d.setFont('helvetica','normal');mute();d.text(k,140,y);ink();d.text(rs(val),W-M-2,y,{align:'right'});y+=6});
  d.setDrawColor(227,221,210);d.line(140,y-3,W-M,y-3);y+=2;
  d.setFont('helvetica','bold');d.setFontSize(11.5);ink();d.text('Balance due',140,y);d.text(rs(bal),W-M-2,y,{align:'right'});y+=10;
  d.setFont('helvetica','italic');d.setFontSize(9.5);ink();
  const wt=d.splitTextToSize('Rupees '+words(inv.total)+' only',W-2*M);d.text(wt,M,y);y+=wt.length*5+2;
  d.setFont('helvetica','normal');d.setFontSize(9);mute();
  if(/supply/i.test(BIZ.title||'')){d.text('Fresh eggs (HSN 0407) are exempt from GST.',M,y);y+=5}
  if(BIZ.upi){ink();d.setFont('helvetica','bold');d.text('Pay by UPI: '+BIZ.upi,M,y);d.setFont('helvetica','normal');mute();y+=5}
  if(inv.note){const t=d.splitTextToSize('Note: '+inv.note,W-2*M);d.text(t,M,y);y+=t.length*4}
  d.setFontSize(8.5);mute();d.text('Thank you for stocking Star Eggs.',W/2,286,{align:'center'});
  return d.output('arraybuffer');
}
function revealInvoice(){if(window.matchMedia('(max-width:900px)').matches)setTimeout(()=>$('#invHead').scrollIntoView({behavior:'smooth',block:'start'}),60)}
function fillBiz(){
  if($('#fBiz').contains(document.activeElement))return;
  const m={z_name:'name',z_addr:'addr',z_phone:'phone',z_gstin:'gstin',z_fssai:'fssai',z_upi:'upi',z_prefix:'prefix',z_next:'next',z_title:'title'};
  Object.entries(m).forEach(([id,k])=>{$('#'+id).value=BIZ[k]??''});
}
$('#fBiz').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db||!canWrite)return toast('Saving is not available in this view');
  const nb={name:v('#z_name')||'Star Eggs',addr:v('#z_addr'),phone:v('#z_phone'),gstin:v('#z_gstin').toUpperCase(),fssai:v('#z_fssai'),upi:v('#z_upi'),prefix:v('#z_prefix'),next:Math.max(1,Math.floor(n('#z_next')||1)),title:$('#z_title').value};
  if(await guard(db.saveSettings(nb),'Business details saved')){document.activeElement.blur();renderInvoices()}
});

function setStatus(msg){const s=$('#status');if(!msg){s.hidden=true;return}s.hidden=false;s.textContent=msg}
function lockForms(){document.querySelectorAll('form.entry button[type=submit]').forEach(b=>b.disabled=true)}

/* ---------- boot ---------- */
try{const t=location.hash.slice(1)||localStorage.getItem('se_tab');if(t&&FORMS&&document.getElementById('p-'+t))showTab(t)}catch(e){}
resetForm('buy');resetForm('sell');resetForm('inv');resetForm('exp');
$('#v_date').value=today();fillBiz();
render();

/* ---------- Supabase data layer ---------- */
const TABLES=Object.keys(S);
function clean(t,d){
  const o=Object.assign({},d);['id','t','created_at','sample','draft','num'].forEach(k=>delete o[k]);
  if('invoiceNo' in o){o.invoice_no=o.invoiceNo;delete o.invoiceNo}
  if(t==='settings'&&'next' in o){o.next_no=o.next;delete o.next}
  return o;
}
function norm(t,row){
  const r=Object.assign({},row);r.t=Date.parse(r.created_at)||0;
  if(t==='sales')r.invoiceNo=r.invoice_no||null;
  if(t==='settings')r.next=r.next_no;
  return r;
}
let rq=0;const scheduleRender=()=>{cancelAnimationFrame(rq);rq=requestAnimationFrame(render)};
function upsertLocal(t,row){
  if(t==='settings'){applySettings(row);return}
  if(!S[t]||!row)return;
  const r=norm(t,row),i=S[t].findIndex(x=>x.id===r.id);
  if(i>=0)S[t][i]=r;else S[t].push(r);
  scheduleRender();
}
function removeLocal(t,id){if(!S[t])return;S[t]=S[t].filter(x=>x.id!==id);scheduleRender()}
function applySettings(row){
  const r=norm('settings',row);BIZ=Object.assign({},DEFBIZ);
  ['name','addr','phone','gstin','fssai','upi','prefix','next','title'].forEach(k=>{if(r[k]!=null&&r[k]!=='')BIZ[k]=r[k]});
  if(r.prefix==='')BIZ.prefix='';
  fillBiz();renderInvoices();
}
const api={
  async insert(t,d){const {data,error}=await sb.from(t).insert(clean(t,d)).select().single();if(error)throw error;upsertLocal(t,data);return norm(t,data)},
  async update(t,id,d){const {data,error}=await sb.from(t).update(clean(t,d)).eq('id',id).select().single();if(error)throw error;upsertLocal(t,data);return norm(t,data)},
  async remove(t,id){const {error}=await sb.from(t).delete().eq('id',id);if(error)throw error;removeLocal(t,id)},
  async saveSettings(o){const {data,error}=await sb.from('settings').upsert(Object.assign({id:1},clean('settings',o))).select().single();if(error)throw error;applySettings(data)}
};
async function fetchAll(t){
  const out=[];
  for(let from=0;;from+=1000){
    const {data,error}=await sb.from(t).select('*').order('created_at',{ascending:true}).range(from,from+999);
    if(error)throw error;out.push(...data);if(data.length<1000)break;
  }
  return out;
}
async function loadAll(){
  const rows=await Promise.all(TABLES.map(fetchAll));
  rows.forEach((data,i)=>{const t=TABLES[i];S[t]=data.map(x=>norm(t,x));loaded.add(t)});
  const st=await sb.from('settings').select('*').eq('id',1).maybeSingle();
  if(st.data)applySettings(st.data);
  render();
}

/* ---------- sign in & start ---------- */
const canShareFiles=(()=>{try{return !!(navigator.canShare&&navigator.canShare({files:[new File(['x'],'x.pdf',{type:'application/pdf'})]}))}catch(e){return false}})();
$('#pdfBtn').textContent=$('#sheetPdf').textContent=(NATIVE||canShareFiles)?'Share PDF':'Download PDF';

function showLogin(msg){
  $('#app').hidden=true;$('#login').hidden=false;
  const err=$('#l_err');err.hidden=!msg;err.textContent=msg||'';
}
let started=false;
async function start(session){
  if(started)return;started=true;
  $('#login').hidden=true;$('#app').hidden=false;$('#signOut').hidden=false;
  db=api;setStatus('Loading your books…');
  try{
    const {data:isMember,error}=await sb.rpc('is_member');
    if(!error&&isMember===false){
      canWrite=false;lockForms();
      setStatus('The account '+(session?.user?.email||'')+' is not on the team list yet. Ask the owner to add it, then sign in again.');
      return;
    }
    await loadAll();setStatus('');
  }catch(e){console.error(e);setStatus(navigator.onLine?'Could not load the books. Pull down or reopen the app to try again.':'You are offline. Connect to the internet to load the books.')}
  sb.channel('star-eggs-live')
    .on('postgres_changes',{event:'*',schema:'public'},p=>{
      if(p.eventType==='DELETE'){if(p.old&&p.old.id!=null)removeLocal(p.table,p.old.id)}
      else upsertLocal(p.table,p.new);
    }).subscribe();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadAll().catch(()=>{})});
}

$('#fLogin').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=v('#l_email'),password=$('#l_pass').value,btn=$('#l_btn');
  if(!email||!password)return showLogin('Enter your email and password.');
  btn.disabled=true;btn.textContent='Signing in…';
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  btn.disabled=false;btn.textContent='Sign in';
  if(error)return showLogin(/invalid/i.test(error.message)?'Wrong email or password.':'Could not sign in. Check your connection and try again.');
  start(data.session);
});
$('#signOut').onclick=async()=>{await sb.auth.signOut();location.reload()};

(async()=>{
  const cfg=window.STAR_EGGS_CONFIG||{};
  if(!window.supabase||!cfg.supabaseUrl||/YOUR-/.test(cfg.supabaseUrl+cfg.supabaseAnonKey)){
    showLogin('This app is not connected to its database yet. Add the Supabase URL and anon key to config.js.');
    $('#l_btn').disabled=true;return;
  }
  sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session}}=await sb.auth.getSession();
  if(session)start(session);else showLogin();
  sb.auth.onAuthStateChange((ev,s)=>{if(ev==='SIGNED_OUT')showLogin()});
})();

/* ---------- install as app ---------- */
if(NATIVE)document.documentElement.classList.add('native');
if(!NATIVE&&'serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))}
let installEvt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();if(NATIVE)return;installEvt=e;$('#installBtn').hidden=false});
$('#installBtn').onclick=async()=>{if(!installEvt)return;installEvt.prompt();await installEvt.userChoice;installEvt=null;$('#installBtn').hidden=true};
window.addEventListener('appinstalled',()=>{$('#installBtn').hidden=true;toast('Star Eggs installed')});
const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
let tipSeen=false;try{tipSeen=localStorage.getItem('se_iostip')==='1'}catch(e){}
if(ios&&!standalone&&!tipSeen&&!NATIVE)$('#iosTip').hidden=false;
$('#iosTipClose').onclick=()=>{$('#iosTip').hidden=true;try{localStorage.setItem('se_iostip','1')}catch(e){}};
})();
