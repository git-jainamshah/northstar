// Keep existing DOM nodes, focus, scroll and disclosures during background updates.
export function patchDOM(root,html,{background=false}={}){
 const template=document.createElement('template');template.innerHTML=html;
 function sync(old,next){
  if(old.nodeType!==next.nodeType||old.nodeName!==next.nodeName||(old.nodeType===1&&old.id!==next.id)){old.replaceWith(next.cloneNode(true));return;}
  if(old.nodeType===3){if(old.nodeValue!==next.nodeValue)old.nodeValue=next.nodeValue;return;}
  if(old.nodeType!==1)return;
  if(background&&((old.matches('form')&&old.contains(document.activeElement))||(old.matches('[data-chart],[data-candles]')&&(old.matches(':hover')||old.contains(document.activeElement)))))return;
  if(old.isEqualNode(next))return;
  for(const attr of [...old.attributes])if(!next.hasAttribute(attr.name)&&!(old.tagName==='DETAILS'&&attr.name==='open'))old.removeAttribute(attr.name);
  for(const attr of [...next.attributes])if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
  children(old,next);
 }
 function children(old,next){
  const wanted=[...next.childNodes];for(let i=0;i<wanted.length;i++){const current=old.childNodes[i];if(current)sync(current,wanted[i]);else old.appendChild(wanted[i].cloneNode(true));}
  while(old.childNodes.length>wanted.length)old.lastChild.remove();
 }
 children(root,template.content);
}
