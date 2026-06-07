/**
 * `emitJs` — turn a typed {@link ScriptModel} into canonical KubeJS JavaScript (spec 0012 FR-1).
 *
 * The *structure* of the script comes entirely from the node kinds; every embedded value passes
 * through an encoder ({@link jsString}/{@link jsItem}/{@link jsInt}). Output is tab-indented to match
 * KubeJS's on-disk style and follows definition order, so the same model yields byte-identical text
 * (Constitution P3/P7). This is the **only** path from data to script text.
 *
 * Emitted shapes are pinned to a documented FTB XMod Compat / KubeJS target
 * ([DOMAIN §7.3](../../../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)); a
 * V8 parse-back proves they load, in-game firing is the manual phase DoD (Constitution P5).
 */
import {
  type EmitAction,
  type EmitRecipe,
  type ScriptModel,
  type ScriptStatement,
  jsInt,
  jsItem,
  jsString,
} from './types.ts';

function emitAction(action: EmitAction): string {
  switch (action.kind) {
    case 'command':
      return `event.server.runCommandSilent(${jsString(action.command)})`;
    case 'give':
      return `event.player.give(Item.of(${jsItem(action.item)}, ${jsInt(action.count)}))`;
    case 'log':
      return `console.log(${jsString(action.message)})`;
  }
}

function emitRecipe(recipe: EmitRecipe): string {
  if (recipe.kind === 'shaped') {
    const pattern = `[${recipe.pattern.map((row) => jsString(row)).join(', ')}]`;
    const keyEntries = Object.entries(recipe.key).map(
      ([symbol, item]) => `${jsString(symbol)}: ${jsItem(item)}`,
    );
    const key = keyEntries.length > 0 ? `{ ${keyEntries.join(', ')} }` : '{}';
    return `event.shaped(Item.of(${jsItem(recipe.output)}, ${jsInt(recipe.count)}), ${pattern}, ${key})`;
  }
  const ingredients = `[${recipe.ingredients.map((item) => jsItem(item)).join(', ')}]`;
  return `event.shapeless(Item.of(${jsItem(recipe.output)}, ${jsInt(recipe.count)}), ${ingredients})`;
}

function emitStatement(statement: ScriptStatement): string {
  if (statement.kind === 'questEvent') {
    const lines = [
      `FTBQuestsEvents.${statement.event}(event => {`,
      `\tif (event.quest.id == ${jsString(statement.questId)}) {`,
    ];
    for (const action of statement.actions) lines.push(`\t\t${emitAction(action)}`);
    lines.push('\t}', '})');
    return lines.join('\n');
  }
  const lines = ['ServerEvents.recipes(event => {'];
  for (const recipe of statement.recipes) lines.push(`\t${emitRecipe(recipe)}`);
  lines.push('})');
  return lines.join('\n');
}

/** Render a script model to KubeJS JavaScript. Blocks are separated by a blank line; ends with `\n`. */
export function emitJs(model: ScriptModel): string {
  const blocks = model.statements.map(emitStatement);
  return `${blocks.join('\n\n')}\n`;
}
