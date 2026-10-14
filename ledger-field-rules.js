function pendingHandler(record){return record.status===0?(record.initialReviewer||'张广利'):record.status===1?(record.finalReviewer||'王志磊'):record.status===3?record.reporter:'—'}
const renderBeforePendingHandler=render;
render=function(){renderBeforePendingHandler();document.querySelector('.table-shell thead th:nth-child(9)').textContent='待处理人';const records=filtered().slice((page-1)*6,page*6);document.querySelectorAll('#rows tr').forEach((row,i)=>{row.children[8].textContent=pendingHandler(records[i])})};
const openEntryBeforeFieldRules=openEntry;
openEntry=function(mode){openEntryBeforeFieldRules(mode);if(mode!=='single'||$('entryOverlay').hidden)return;['ledgerDescription','ledgerMeasures'].forEach(id=>{const input=$(id);input.maxLength=200;const counter=document.createElement('div');counter.className='sub';counter.style.textAlign='right';counter.setAttribute('aria-live','polite');input.insertAdjacentElement('afterend',counter);const update=()=>{counter.textContent=input.value.length+' / 200'};input.addEventListener('input',update);update()})};
const saveEntryBeforeFieldRules=$('entrySave').onclick;
$('entrySave').onclick=()=>{if(entryMode==='single'){if($('ledgerDescription').value.length>200||$('ledgerMeasures').value.length>200){notify('安全隐患描述及临时安全措施和应急处置要求最多200字');return}}else if(importRows.some(r=>String(r['安全隐患描述']||'').length>200||String(r['临时安全措施和应急处置要求']||'').length>200)){notify('导入记录的安全隐患描述及临时安全措施和应急处置要求最多200字');return}saveEntryBeforeFieldRules()};
render();
