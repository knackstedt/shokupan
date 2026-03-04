import { EventEmitter } from '@angular/core';

class ColumnDirective {
    onCellClick = new EventEmitter();
    field = "status";
    title = "Status";
}

const getProps = (obj = {}) => {
    const props = {};
    Object.entries(obj).forEach(([k, v]) => {
        if (k.startsWith('_')) return;
        if (k.startsWith('on')) return;
        if (['tabulator', 'cellTemplate', 'headerTemplate'].includes(k)) return;
        props[k] = v;
    });
    return props;
};

const c = new ColumnDirective();

const obj = getProps(c);
Object.entries(c).forEach(([k, v]) => {
    if (!(v instanceof EventEmitter)) return;
    const key = k.replace(/^on/, '');
    const mappedKey = key.charAt(0).toLowerCase() + key.slice(1);
    obj[mappedKey] = (...args) => v.emit([args]);
});

console.log("GENERATED COLUMN CONFIG:", Object.keys(obj));
