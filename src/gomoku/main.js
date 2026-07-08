// 酒馆入口：在 SillyTavern「界面」里被 import 并调用。
// 把图形界面接到真正的 TavernHelper 适配器（世界书存储 + generate）。

import { mountGomoku } from './ui.js';
import { tavernIO, tavernGenerate } from '../adapters/tavern.js';

/** container：要挂载棋盘的 DOM 元素。 */
export function start(container) {
  return mountGomoku(container, { io: tavernIO, generate: tavernGenerate });
}
