const escapeXml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');

export function createStrategyReferenceXml(strategy) {
  const label = `4.0 STRATEGY REFERENCE — ${strategy.name} (${strategy.model})\n${strategy.rule}\nRESEARCH ONLY · NOT AN EXECUTABLE BOT`;
  return `<xml xmlns="https://developers.google.com/blockly/xml"><block type="text_print" id="senfx-reference-${escapeXml(strategy.id)}" x="24" y="24"><value name="TEXT"><block type="text"><field name="TEXT">${escapeXml(label)}</field></block></value></block></xml>`;
}

export function createStrategyBootstrap(strategies) {
  const catalog = strategies.map(({id,name,model,rule})=>({id,name,model,rule}));
  const source = [
    '(() => {',
    `  const catalog = ${JSON.stringify(catalog)};`,
    "  const strategyId = new URLSearchParams(window.location.search).get('senfx_strategy');",
    '  const strategy = catalog.find(item => item.id === strategyId);',
    '  if (!strategy) return;',
    '  let attempts = 0;',
    '  const mount = () => {',
    '    const workspace = window.Blockly && window.Blockly.derivWorkspace;',
    "    if (!workspace || typeof window.Blockly.utils?.xml?.textToDom !== 'function') {",
    '      if (++attempts < 120) window.setTimeout(mount, 250);',
    '      return;',
    '    }',
    "    const referenceId = 'senfx-reference-' + strategy.id;",
    "    if (strategy.id === 'nexus-flow') {",
    "      const tradeParameters = workspace.getTopBlocks(false).find(block => block.type === 'trade_definition');",
    '      if (!tradeParameters) {',
    '        if (++attempts < 120) window.setTimeout(mount, 250);',
    '        return;',
    '      }',
    "      if (workspace.__senfxStrategyReference === strategy.id) return;",
    "      const note = 'Nexus Flow — research strategy\\n' + strategy.rule + '\\nResearch preview only; trade execution remains disabled.';",
    '      tradeParameters.setCommentText(note);',
    "      tradeParameters.getIcon('comment')?.setBubbleVisible(true);",
    '      workspace.__senfxStrategyReference = strategy.id;',
    '      workspace.render();',
    '      return;',
    '    }',
    '    if (workspace.__senfxStrategyReference === strategy.id || workspace.getBlockById?.(referenceId)) {',
    '      workspace.__senfxStrategyReference = strategy.id;',
    '      return;',
    '    }',
    '    try {',
    '      const roots = workspace.getTopBlocks(false);',
    '      roots.forEach(block => block.moveBy(0, 190));',
    "      const label = '4.0 STRATEGY REFERENCE — ' + strategy.name + ' (' + strategy.model + ')\\n' + strategy.rule + '\\nRESEARCH ONLY · NOT AN EXECUTABLE BOT';",
    "      const xml = '<xml xmlns=\"https://developers.google.com/blockly/xml\"><block type=\"text_print\" id=\"' + referenceId + '\" x=\"24\" y=\"24\"><value name=\"TEXT\"><block type=\"text\"><field name=\"TEXT\">' + label.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll(\"'\",'&apos;') + '</field></block></value></block></xml>';",
    '      window.Blockly.Xml.domToWorkspace(window.Blockly.utils.xml.textToDom(xml), workspace);',
    '      workspace.__senfxStrategyReference = strategy.id;',
    '      workspace.render();',
    '    } catch (error) {',
    "      console.warn('Could not mount the SENFX 4.0 strategy reference in DBot.', error);",
    '    }',
    '  };',
    '  mount();',
    '})();',
  ].join('\n');
  return `<script>${source}</script>`;
}
