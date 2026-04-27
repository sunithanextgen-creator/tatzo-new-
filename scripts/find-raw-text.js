/*
  Finds raw text nodes rendered outside <Text> in React Native TSX.
  Usage: node scripts/find-raw-text.js

  It reports:
  - JsxText under non-Text tags
  - JSX child expressions that contain a string literal/template (cond ? 'x' : null, a && 'x', etc)
  - Heuristic: JSX child expressions under non-Text tags that are NOT JSX elements/fragments
*/
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && full.endsWith('.tsx')) out.push(full);
  }
}

function tagNameToString(tagName) {
  if (!tagName) return 'Unknown';
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) return `${tagNameToString(tagName.expression)}.${tagName.name.text}`;
  return 'Unknown';
}

function report(file, sf, node, inTag, kind, text) {
  const lc = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const line = lc.line + 1;
  const col = lc.character + 1;
  const snippet = String(text).replace(/\s+/g, ' ').trim().slice(0, 140);
  console.log(`${file}:${line}:${col}  [${kind}] under <${inTag}>  "${snippet}"`);
}

function containsStringLeaf(expr) {
  if (!expr) return false;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return true;
  if (ts.isTemplateExpression(expr)) return true;
  if (ts.isParenthesizedExpression(expr)) return containsStringLeaf(expr.expression);
  if (ts.isBinaryExpression(expr)) return containsStringLeaf(expr.left) || containsStringLeaf(expr.right);
  if (ts.isConditionalExpression(expr)) return containsStringLeaf(expr.whenTrue) || containsStringLeaf(expr.whenFalse);
  if (ts.isCallExpression(expr)) return expr.arguments.some(containsStringLeaf);
  if (ts.isArrayLiteralExpression(expr)) return expr.elements.some(containsStringLeaf);
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.some((p) => ts.isPropertyAssignment(p) && containsStringLeaf(p.initializer));
  }
  return false;
}

function containsJsxLeaf(expr) {
  if (!expr) return false;
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) return true;
  if (ts.isParenthesizedExpression(expr)) return containsJsxLeaf(expr.expression);
  if (ts.isConditionalExpression(expr)) return containsJsxLeaf(expr.whenTrue) || containsJsxLeaf(expr.whenFalse);
  if (ts.isBinaryExpression(expr)) return containsJsxLeaf(expr.left) || containsJsxLeaf(expr.right);
  if (ts.isCallExpression(expr)) return containsJsxLeaf(expr.expression) || expr.arguments.some(containsJsxLeaf);
  if (ts.isArrayLiteralExpression(expr)) return expr.elements.some(containsJsxLeaf);
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.some((p) => ts.isPropertyAssignment(p) && containsJsxLeaf(p.initializer));
  }
  return false;
}

function scanFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tagStack = [];

  function currentTag() {
    return tagStack.length ? tagStack[tagStack.length - 1] : 'ROOT';
  }

  function visit(node, inChildren) {
    if (ts.isJsxElement(node)) {
      const tag = tagNameToString(node.openingElement.tagName);
      tagStack.push(tag);
      node.children.forEach((c) => visit(c, true));
      tagStack.pop();
      return;
    }

    if (ts.isJsxSelfClosingElement(node)) {
      return;
    }

    if (ts.isJsxFragment(node)) {
      tagStack.push('Fragment');
      node.children.forEach((c) => visit(c, true));
      tagStack.pop();
      return;
    }

    if (inChildren && ts.isJsxText(node)) {
      const txt = node.getText(sf);
      if (txt && txt.trim().length) {
        const inTag = currentTag();
        if (inTag !== 'Text') report(file, sf, node, inTag, 'JsxText', txt);
      }
      return;
    }

    if (inChildren && ts.isJsxExpression(node) && node.expression) {
      const inTag = currentTag();
      if (inTag !== 'Text') {
        if (containsStringLeaf(node.expression)) {
          report(file, sf, node, inTag, 'ExprContainsString', node.getText(sf));
        } else if (!containsJsxLeaf(node.expression)) {
          const exprKind = ts.SyntaxKind[node.expression.kind] || String(node.expression.kind);
          report(file, sf, node, inTag, `ChildExpr:${exprKind}`, node.getText(sf));
        }
      }
      return;
    }

    ts.forEachChild(node, (child) => visit(child, false));
  }

  visit(sf, false);
}

const files = [];
walk(srcRoot, files);

for (const f of files) {
  try {
    scanFile(f);
  } catch (e) {
    console.error('Failed to scan', f, e && e.message ? e.message : e);
  }
}

console.log(`Scan complete (${files.length} files).`);
