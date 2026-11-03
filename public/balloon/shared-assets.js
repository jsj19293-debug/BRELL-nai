'use strict';
// Nightmare 4: 공용 에셋(서버 기능)은 빼고 앱 안에서만 쓴다. 다른 파일이 부르는 이름만 남겨 둔다.
let sharedAssets=[],sharedAssetOwner=false,sharedAssetBusy=false;
function sharedAssetMessage(){}
function refreshSharedAssets(){}
async function loadSharedAssets(){}
async function initSharedAssets(){const tab=document.getElementById('assetCatalogShared');if(tab)tab.hidden=true;const section=document.getElementById('sharedAssetSection');if(section)section.hidden=true}
