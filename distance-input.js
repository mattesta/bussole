(function(root) {
  const grouping = /['’‘\s]/g;
  const clean = value => String(value).replace(grouping, '');
  function format(value) {
    const text = clean(value);
    if (!/^\d*(?:[.,]\d*)?$/.test(text)) return String(value);
    return text.replace(/^\d+/, digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '’'));
  }
  function parse(value) {
    const text = clean(value);
    if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return NaN;
    const number = Number(text.replace(',', '.'));
    return Number.isFinite(number) ? number : NaN;
  }
  function position(value, count) {
    let index = 0;
    while (index < value.length && count > 0) {
      if (!/['’‘\s]/.test(value[index])) count--;
      index++;
    }
    return index;
  }
  function apply(input, start, end = start) {
    const raw = input.value;
    const left = clean(raw.slice(0, start)).length;
    const right = clean(raw.slice(0, end)).length;
    input.value = format(raw);
    input.setSelectionRange(position(input.value, left), position(input.value, right));
  }
  function attach(input) {
    input.addEventListener('input', () => apply(input, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length));
    input.addEventListener('beforeinput', event => {
      const start = input.selectionStart;
      if (start === null || start !== input.selectionEnd) return;
      // Backspace/delete beside a separator should remove a digit, rather
      // than repeatedly deleting a separator that formatting puts back.
      if (event.inputType === 'deleteContentBackward' && start > 1 && /['’‘]/.test(input.value[start - 1])) {
        event.preventDefault();
        input.value = input.value.slice(0, start - 2) + input.value.slice(start);
        apply(input, start - 2);
      } else if (event.inputType === 'deleteContentForward' && /['’‘]/.test(input.value[start] || '')) {
        event.preventDefault();
        input.value = input.value.slice(0, start) + input.value.slice(start + 2);
        apply(input, start);
      }
    });
  }
  root.BussoleDistanceInput = {format, parse, attach};
})(window);
