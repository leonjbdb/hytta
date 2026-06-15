/**
 * Inline script that runs before React hydrates. Strips data-* attributes
 * injected by password-manager / autofill browser extensions (Proton Pass,
 * 1Password, Enpass, LastPass, Bitwarden, Dashlane). Those extensions add
 * markers like `data-protonpass-form` to form-like elements after HTML parse
 * but before hydration, producing "tree hydrated but some attributes ...
 * didn't match" warnings on every form-bearing page. The attributes have
 * no functional impact on the app.
 *
 * Strategy: synchronous initial sweep of the document, then a permanent
 * MutationObserver that strips re-injections (extensions often re-add their
 * attributes after we remove them, so we must keep watching).
 */
const PATTERN = /^data-(protonpass|enpass|onepassword|dashlane|saferpass|bitwarden|1p|lp|bw)/i;

export const stripExtensionAttrsScript = `(function(){
  var P=${PATTERN.toString()};
  function strip(el){
    if(!el||!el.attributes)return;
    for(var i=el.attributes.length-1;i>=0;i--){
      var n=el.attributes[i].name;
      if(P.test(n))el.removeAttribute(n);
    }
  }
  function sweep(root){
    strip(root);
    if(root.querySelectorAll)root.querySelectorAll('*').forEach(strip);
  }
  try{sweep(document.documentElement);}catch(e){}
  try{
    new MutationObserver(function(muts){
      for(var i=0;i<muts.length;i++){
        var m=muts[i];
        if(m.type==='attributes'&&m.attributeName&&P.test(m.attributeName)){
          m.target.removeAttribute(m.attributeName);
        }else if(m.type==='childList'){
          for(var j=0;j<m.addedNodes.length;j++){
            var n=m.addedNodes[j];
            if(n.nodeType===1)sweep(n);
          }
        }
      }
    }).observe(document.documentElement,{attributes:true,subtree:true,childList:true});
  }catch(e){}
})();`;
