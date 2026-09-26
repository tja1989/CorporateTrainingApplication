/** Regenerate source entry points for the browser-qualification coverage audit.
 * This is an inventory, not evidence that a route or action has been tested. */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
function directive(statements: ts.NodeArray<ts.Statement>, value: string) {
  return statements.some(statement => ts.isExpressionStatement(statement)
    && ts.isStringLiteral(statement.expression) && statement.expression.text === value);
}
function exported(node: ts.Node) {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
}
function publicRoute(file: string) {
  return "/" + file.replace(/^app\//, "").replace(/(^|\/)(page|route)\.tsx?$/, "")
    .split("/").filter(part => !/^\(.+\)$/.test(part) && !part.startsWith("@")).join("/");
}
function role(file: string) {
  if (file.includes("/(learner)/")) return "authenticated learner workspace";
  if (file.includes("/(workspace)/admin/")) return "admin";
  if (file.includes("/(workspace)/")) return "manager/admin workspace";
  if (file.includes("/(auth)/")) return "authentication";
  return "inspect runtime guard";
}
const routes: object[] = [], apis: object[] = [], serverActions: object[] = [];
for (const absolute of [...files(join(root, "app")), ...files(join(root, "lib")), ...files(join(root, "components"))].sort()) {
  const file = relative(root, absolute).replaceAll("\\", "/");
  const source = ts.createSourceFile(file, readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
  const moduleServer = directive(source.statements, "use server");
  const line = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  if (/\/page\.tsx?$/.test(file)) routes.push({ route: publicRoute(file), file, role: role(file) });
  const methods: string[] = [];
  const addAction = (node: ts.Node, name: string, kind: string) => serverActions.push({ id: `${file}:${name}:${line(node)}`, file, line: line(node), name, kind, role: role(file) });
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.body) {
      const name = node.name?.text ?? "default";
      if (exported(node) && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)) methods.push(name);
      if (moduleServer && exported(node)) addAction(node, name, "module export");
      else if (directive(node.body.statements, "use server")) addAction(node, name, "inline server action");
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const fn = declaration.initializer;
        if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) continue;
        const name = declaration.name.getText(source);
        if (exported(node) && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)) methods.push(name);
        if (moduleServer && exported(node)) addAction(declaration, name, "module export");
        else if (ts.isBlock(fn.body) && directive(fn.body.statements, "use server")) addAction(declaration, name, "inline server action");
      }
    }
    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && !ts.isVariableDeclaration(node.parent)
      && ts.isBlock(node.body) && directive(node.body.statements, "use server")) addAction(node, "inline callback", "inline server action");
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (/\/route\.tsx?$/.test(file)) apis.push({ route: publicRoute(file), file, methods: [...new Set(methods)].sort() });
}
const output = process.argv[2] ?? ".artifacts/source-inventory.json";
const inventory = {
  generatedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  dirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
  qualification: "NOT_TESTED — source enumeration only; reconcile visible client actions, guards and workflow branches separately.",
  counts: { routes: routes.length, apis: apis.length, serverActions: serverActions.length }, routes, apis, serverActions,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(inventory, null, 2) + "\n");
console.log(JSON.stringify({ output, ...inventory.counts }));
