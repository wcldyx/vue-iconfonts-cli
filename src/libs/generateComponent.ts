import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import glob from 'glob';
import colors from 'colors';
import { camelCase, upperFirst } from 'lodash';
import { XmlData } from 'iconfont-parser';
import { Config } from './getConfig';
import { getTemplate } from './getTemplate';
import {
  replaceCases,
  replaceComponentName,
  replaceExports,
  replaceImports,
  replaceSingleIconContent,
  replaceSize,
  replaceSizeUnit,
} from './replace';
import { whitespace } from './whitespace';

const ATTRIBUTE_FILL_MAP = ['path'];

/**
 * 比较给定的文本和文件路径中文件的内容是否一致
 * @param text - 要比较的文本
 * @param filePath - 要比较的文件路径
 * @returns 如果文本和文件内容一致，返回true；否则返回false
 * @example
 * ```typescript
 * const text = 'hello world';
 * const filePath = './test.txt';
 * fs.writeFileSync(filePath, text, 'utf-8');
 * const isMatch = compareTextWithFileContent(text, filePath);
 * console.log(isMatch); // true
 * ```
 */
function compareTextWithFileContent(text: string, filePath: string): boolean {
  try {
    // 读取文件内容
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    // 比较文本和文件内容是否一致
    return text === fileContent;
  } catch (error) {
    console.error(`Error reading file: ${error}`);
    // 如果读取文件失败，返回false
    return false;
  }
}


// 生成ts类型提示文件
export const generateType = (cases: string[], saveDir: string) => {
  let iconFile = getTemplate('Icon.d.ts');
  iconFile = replaceCases(iconFile, cases.map((item) => `'${item}'`).join(" | "));
  fs.writeFileSync(path.join(saveDir, 'index.d.ts'), iconFile);
}


export const generateComponent = (data: XmlData, config: Config) => {
  const imports: string[] = [];
  const saveDir = path.resolve(config.save_dir);
  const jsExtension = '.js';
  let cases: string[] = [];

  mkdirp.sync(saveDir);
  glob.sync(path.join(saveDir, '*')).forEach((file) => fs.unlinkSync(file));

  data.svg.symbol.forEach((item) => {
    let singleFile: string;
    let iconId = item.$.id;

    if (config.trim_icon_prefix) {
      iconId = iconId.replace(new RegExp(`^${config.trim_icon_prefix}(.+?)$`), (_, value) => value.replace(/^[-_.=+#@!~*]+(.+?)$/, '$1'))
    }

    const componentName = upperFirst(camelCase(iconId));

    cases.push(componentName);

    imports.push(componentName);

    singleFile = getTemplate('SingleIcon' + jsExtension);
    singleFile = replaceSize(singleFile, config.default_icon_size);
    singleFile = replaceComponentName(singleFile, componentName);
    const { svgColors, template } = generateCase(item, 4);
    singleFile = replaceSingleIconContent(singleFile, template);
    singleFile = singleFile.replace(/#svgColors#/g, JSON.stringify(Array.from(svgColors)));
    singleFile = replaceSizeUnit(singleFile, config.unit);

    const filePath = path.join(saveDir, componentName + '.vue');
    if (compareTextWithFileContent(singleFile, filePath)) {
      return;
    }
    fs.writeFileSync(filePath, singleFile);
    console.log(`${colors.green('√')} Generated icon "${colors.yellow(iconId)}"`);
  });

  let iconFile = getTemplate('Icon' + jsExtension);

  iconFile = replaceSize(iconFile, config.default_icon_size);
  iconFile = replaceCases(iconFile, cases.join(",\n"));
  iconFile = replaceImports(iconFile, imports);
  iconFile = replaceExports(iconFile, imports);

  fs.writeFileSync(path.join(saveDir, 'index.js'), iconFile);

  generateType(cases, saveDir);

  console.log(`\n${colors.green('√')} All icons have putted into dir: ${colors.green(config.save_dir)}\n`);
};

const generateCase = (data: XmlData['svg']['symbol'][number], baseIdent: number) => {
  let template = `${whitespace(baseIdent)}<svg viewBox="${data.$.viewBox}" :width="size" :height="size" :style="variables" v-bind="$attrs">\n`;

  const counter = {
    baseIdent,
    svgColors: new Set<string>(),
  };

  for (const domName of Object.keys(data)) {
    if (domName === '$') {
      continue;
    }

    if (!domName) {
      console.error(colors.red(`Unable to transform dom "${domName}"`));
      process.exit(1);
    }

    if (data[domName].$) {
      template += `${whitespace(baseIdent + 2)}<${domName}${addAttribute(domName, data[domName], counter)}\n${whitespace(baseIdent + 2)}/>\n`;
    } else if (Array.isArray(data[domName])) {
      data[domName].forEach((sub) => {
        template += `${whitespace(baseIdent + 2)}<${domName}${addAttribute(domName, sub, counter)}\n${whitespace(baseIdent + 2)}/>\n`;
      });
    }
  }

  template += `${whitespace(baseIdent)}</svg>`;
  // 判断颜色是否是同一种颜色
  return {
    template,
    svgColors: counter.svgColors.size === 1 ? new Set<string>(["currentColor"]) : counter.svgColors,
  };
};

const addAttribute = (domName: string, sub: XmlData['svg']['symbol'][number]['path'][number], counter: { baseIdent: number, svgColors: Set<string> }) => {
  let template = '';

  if (sub && sub.$) {
    if (ATTRIBUTE_FILL_MAP.includes(domName)) {
      // Set default color same as in iconfont.cn
      // And create placeholder to inject color by user's behavior
      sub.$.fill = sub.$.fill || '#333333';
    }

    for (const attributeName of Object.keys(sub.$)) {
      if (attributeName === 'fill') {
        counter.svgColors.add(sub.$[attributeName]!);
        const currentIndex = Array.from(counter.svgColors).indexOf(sub.$[attributeName]!);
        template += `\n${whitespace(counter.baseIdent + 4)}${camelCase(attributeName)}="var(--svg-color-${currentIndex})"`;
      } else {
        template += `\n${whitespace(counter.baseIdent + 4)}${camelCase(attributeName)}="${sub.$[attributeName]}"`;
      }
    }
  }

  return template;
};
