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
    `  const catalog = ${JSON.stringify(catalog).replaceAll('</', '<\\/')};`,
    "  const strategyId = new URLSearchParams(window.location.search).get('senfx_strategy');",
    '  const strategy = catalog.find(item => item.id === strategyId);',
    '  if (!strategy) return;',
    '  let attempts = 0;',
    '  const mount = () => {',
    '    const workspace = window.Blockly && window.Blockly.derivWorkspace;',
    "    const tradeParameters = workspace?.getTopBlocks(false).find(block => block.type === 'trade_definition');",
    '    if (!workspace || !tradeParameters || !window.Blockly.FieldDropdown) {',
    '      if (++attempts < 120) window.setTimeout(mount, 250);',
    '      return;',
    '    }',
    '    if (!window.Blockly.Blocks.tsfx_strategy_rule) {',
    '      window.Blockly.Blocks.tsfx_strategy_rule = {',
    '        init() {',
    "          this.appendDummyInput().appendField('SENFX strategy').appendField(new window.Blockly.FieldDropdown(catalog.map(item => [item.name, item.id])), 'STRATEGY');",
    '          this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(210);',
    "          this.setTooltip('This Blockly strategy selector chooses the existing Trade Scheme FX rule executed by the server-side virtual Demo worker.');",
    '        },',
    '      };',
    '      window.Blockly.JavaScript.javascriptGenerator.forBlock.tsfx_strategy_rule = () => "";',
    '    }',
    '    let strategyBlock = workspace.getAllBlocks(false).find(block => block.type === "tsfx_strategy_rule");',
    '    if (!strategyBlock) {',
    '      strategyBlock = workspace.newBlock("tsfx_strategy_rule");',
    '      strategyBlock.setFieldValue(strategy.id, "STRATEGY");',
    '      strategyBlock.setCommentText(strategy.rule);',
    '      strategyBlock.initSvg(); strategyBlock.render();',
    '      const input = tradeParameters.getInput("INITIALIZATION");',
    '      const stack = tradeParameters.getBlocksInStatement("INITIALIZATION");',
    '      const last = stack[stack.length - 1];',
    '      if (last?.nextConnection?.isConnected()) last.nextConnection.connect(strategyBlock.previousConnection);',
    '      else input?.connection?.connect(strategyBlock.previousConnection);',
    '    } else {',
    '      strategyBlock.setFieldValue(strategy.id, "STRATEGY");',
    '      strategyBlock.setCommentText(strategy.rule);',
    '    }',
    '    const rule = strategyBlock.getFieldValue("STRATEGY");',
    '    const active = catalog.find(item => item.id === rule) || strategy;',
    "    const note = active.name + ' — strategy rule\\n' + active.rule + '\\nThis rule runs through the Trade Scheme FX Demo worker.';",
    '    tradeParameters.setCommentText(note);',
    "    tradeParameters.getIcon('comment')?.setBubbleVisible(true);",
    '    workspace.__senfxStrategyReference = active.id;',
    '    workspace.render();',
    '    if (!workspace.__senfxStrategyListener) {',
    '      workspace.__senfxStrategyListener = true;',
    '      workspace.addChangeListener(event => {',
    '        if (event.type !== window.Blockly.Events.BLOCK_CHANGE || event.blockId !== strategyBlock.id || event.name !== "STRATEGY") return;',
    '        const selected = catalog.find(item => item.id === strategyBlock.getFieldValue("STRATEGY"));',
    '        if (selected) { tradeParameters.setCommentText(selected.name + " — strategy rule\\n" + selected.rule + "\\nThis rule runs through the Trade Scheme FX Demo worker."); tradeParameters.getIcon("comment")?.setBubbleVisible(true); }',
    '      });',
    '    }',
    '  };',
    '  mount();',
    '})();',
  ].join('\n');
  return `<script>${source}</script>`;
}
