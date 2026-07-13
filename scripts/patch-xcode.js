// Чинит известный краш expo prebuild (Cannot read properties of null, reading 'path')
// внутри библиотеки xcode, которая иначе падает при генерации Xcode-проекта.
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', 'xcode', 'lib', 'pbxProject.js');

if (!fs.existsSync(filePath)) {
  console.log('xcode/lib/pbxProject.js не найден — пропускаем патч (возможно, node_modules ещё не установлены)');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');
const oldLine = 'if (project.pbxGroupByName(group).path)';
const newLine = 'if (project.pbxGroupByName(group)&&project.pbxGroupByName(group).path)';

if (content.includes(newLine)) {
  console.log('Патч xcode уже применён, ничего делать не нужно');
} else if (content.includes(oldLine)) {
  content = content.replace(oldLine, newLine);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Патч xcode успешно применён');
} else {
  console.warn('ВНИМАНИЕ: строка для патча не найдена — возможно, версия пакета xcode изменилась, патч не применён');
}