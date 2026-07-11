"use strict";

// Wiki page behavior ships via plugin.json "scripts" (the document-ready
// wiki*.js files). NodeBB's ajaxify still imports forum/<template> for every
// page template and logs "Cannot find module" when none exists, so each wiki
// template maps this empty page module in plugin.json "modules".
module.exports = { init: function () {} };
