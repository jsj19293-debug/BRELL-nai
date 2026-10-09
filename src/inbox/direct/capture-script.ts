// Ported from NAIS3-Custom (seotk0319/NAIS3-Custom @ 05b3313, based on sunanakgo/NAIS3), GPL-3.0.
import captureSource from '../core/api/capture.js?raw'

const HOSTS =
  /^(?:www\.eden-chat\.com|babechat\.ai|lunatalk\.chat|elyn\.ai|www\.nekochat\.xyz|teapotchat\.com|crack\.wrtn\.ai|rplay\.live|genit\.ai)$/
// The capture script runs inside the platform's own page and relays what the page sends
// into a queue the app polls. It does nothing on any other host, sign-in pages included.
export const CAPTURE_SCRIPT = [
  '(()=>{if(!' +
    HOSTS +
    '.test(location.hostname))return;const q=[];' +
    "Object.defineProperty(globalThis,'__moaCaptured',{value:q});" +
    "window.addEventListener('message',e=>{if(e.source===window&&e.origin===location.origin&&e.data&&e.data.source==='moa-api-profile'&&q.length<200)q.push({platform:e.data.platform,profile:e.data.profile})})})();",
  captureSource,
  ';(()=>{if(' +
    HOSTS +
    ".test(location.hostname))window.postMessage({source:'moa-api-start'},location.origin)})();"
].join('\n')

