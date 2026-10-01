'use strict';

/* =========================================================
   Константы и утилиты
   ========================================================= */
const STORAGE_KEY = 'pitlane-cart';
const FREE_DELIVERY_FROM = 7000;
const DELIVERY_PRICES = { courier: 350, cdek: 250 };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const moneyFormat = new Intl.NumberFormat('ru-RU');
const formatPrice = (value) => `${moneyFormat.format(value)} ₽`;

function plural(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/* =========================================================
   Каталог: читаем товары из разметки
   (HTML остаётся единственным источником данных о товарах)
   ========================================================= */
const productList = $('#product-list');

const products = new Map(
  $$('.product', productList).map((card, index) => [
    card.dataset.id,
    {
      id: card.dataset.id,
      type: card.dataset.type,
      name: $('.product__title', card).textContent.trim(),
      price: Number($('.product__price data', card).value),
      image: $('.product__image', card).innerHTML,
      card,
      item: card.closest('li'),
      index,
    },
  ])
);

/* =========================================================
   Состояние корзины: { [id]: количество }
   ========================================================= */
const cart = {
  items: load(),

  get(id) { return this.items[id] || 0; },

  set(id, qty) {
    if (qty > 0) this.items[id] = Math.min(qty, 99);
    else delete this.items[id];
    save(this.items);
    render();
  },

  add(id) { this.set(id, this.get(id) + 1); },

  clear() {
    this.items = {};
    save(this.items);
    render();
  },

  entries() {
    return Object.entries(this.items)
      .filter(([id]) => products.has(id))
      .map(([id, qty]) => ({ ...products.get(id), qty }));
  },

  get count() { return this.entries().reduce((sum, i) => sum + i.qty, 0); },
  get subtotal() { return this.entries().reduce((sum, i) => sum + i.qty * i.price, 0); },
};

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function save(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* хранилище недоступно — корзина живёт до перезагрузки */
  }
}

// Синхронизация между вкладками
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) {
    cart.items = load();
    render();
  }
});

/* =========================================================
   Отрисовка
   ========================================================= */
const cartCount = $('#cart-count');

function render() {
  renderCards();
  renderHeader();
  renderDrawer();
  renderSummary();
}

function stepperHTML(product, qty, small = false) {
  return `
    <div class="stepper${small ? ' stepper--small' : ''}" role="group" aria-label="Количество: ${product.name}">
      <button type="button" data-action="dec" data-id="${product.id}" aria-label="Уменьшить количество">−</button>
      <output aria-live="polite">${qty}</output>
      <button type="button" data-action="inc" data-id="${product.id}" aria-label="Увеличить количество">+</button>
    </div>`;
}

function addButtonHTML(product) {
  return `<button class="button button--primary product__add" type="button" data-action="add" data-id="${product.id}" aria-label="Добавить в корзину: ${product.name}">В корзину</button>`;
}

// Кнопка «В корзину» превращается в счётчик, когда товар уже добавлен
function renderCards() {
  products.forEach((product) => {
    const action = $('.product__action', product.card);
    const qty = cart.get(product.id);
    const hasStepper = Boolean($('.stepper', action));

    if (qty > 0 && hasStepper) {
      $('output', action).textContent = qty;
    } else if (qty > 0) {
      action.innerHTML = stepperHTML(product, qty);
    } else if (hasStepper || !$('[data-action]', action)) {
      action.innerHTML = addButtonHTML(product);
    }
  });
}

function renderHeader() {
  const count = cart.count;
  cartCount.textContent = count;
  cartCount.setAttribute('aria-label', `${count} ${plural(count, ['товар', 'товара', 'товаров'])}`);
}

const drawer = $('#cart-drawer');
const cartListEl = $('#cart-list');
const cartEmpty = $('#cart-empty');
const cartFooter = $('#cart-footer');

function renderDrawer() {
  const entries = cart.entries();
  const isEmpty = entries.length === 0;

  cartEmpty.hidden = !isEmpty;
  cartFooter.hidden = isEmpty;
  cartListEl.hidden = isEmpty;

  // Сохраняем фокус, если перерисовываем список, в котором он был
  const focused = document.activeElement;
  const focusKey = cartListEl.contains(focused)
    ? `${focused.dataset.action}:${focused.dataset.id}`
    : null;

  cartListEl.innerHTML = entries.map((item) => `
    <li class="cart-item">
      <span class="cart-item__image" aria-hidden="true">${item.image}</span>
      <p class="cart-item__title">${item.name}<small>${formatPrice(item.price)} за шт.</small></p>
      ${stepperHTML(item, item.qty, true)}
      <p class="cart-item__price">${formatPrice(item.price * item.qty)}</p>
      <button class="icon-button cart-item__remove" type="button" data-action="remove" data-id="${item.id}" aria-label="Удалить ${item.name}">${ICON_CLOSE}</button>
    </li>`).join('');

  if (focusKey) {
    const [action, id] = focusKey.split(':');
    const target = $(`[data-action="${action}"][data-id="${id}"]`, cartListEl);
    (target || $('#cart-title')).focus?.();
  }

  const subtotal = cart.subtotal;
  $('#cart-subtotal').textContent = formatPrice(subtotal);

  const left = FREE_DELIVERY_FROM - subtotal;
  $('#free-delivery-text').textContent = left > 0
    ? `До бесплатной доставки ещё ${formatPrice(left)}`
    : 'Доставка будет бесплатной';
  $('#free-delivery-bar').style.width = `${Math.min(subtotal / FREE_DELIVERY_FROM, 1) * 100}%`;
}

/* ---------- Итоги в форме заказа ---------- */
function deliveryCost() {
  if (cart.subtotal >= FREE_DELIVERY_FROM) return 0;
  const method = $('input[name="delivery"]:checked').value;
  return DELIVERY_PRICES[method];
}

function renderSummary() {
  const free = cart.subtotal >= FREE_DELIVERY_FROM;

  $('#summary-list').innerHTML = cart.entries().map((item) => `
    <li><span>${item.name} × ${item.qty}</span><span>${formatPrice(item.price * item.qty)}</span></li>`).join('');

  $$('[data-delivery-price]').forEach((el) => {
    el.textContent = free ? 'бесплатно' : formatPrice(DELIVERY_PRICES[el.dataset.deliveryPrice]);
  });

  const delivery = deliveryCost();
  $('#summary-subtotal').textContent = formatPrice(cart.subtotal);
  $('#summary-delivery').textContent = delivery === 0 ? 'Бесплатно' : formatPrice(delivery);
  $('#summary-total').textContent = formatPrice(cart.subtotal + delivery);
}

/* =========================================================
   Действия с товарами (делегирование событий)
   ========================================================= */
function handleCartAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  const product = products.get(id);
  if (!product) return;

  const inCatalog = productList.contains(button);

  switch (action) {
    case 'add':
    case 'inc':
      cart.add(id);
      bumpCounter();
      if (action === 'add') showToast(`${product.name} в корзине`);
      break;
    case 'dec':
      cart.set(id, cart.get(id) - 1);
      break;
    case 'remove':
      cart.set(id, 0);
      showToast(`${product.name} удалён из корзины`);
      break;
    default:
      return;
  }

  // Возвращаем фокус на логичное место в карточке после перерисовки
  if (inCatalog) {
    const action = $('.product__action', product.card);
    const next = cart.get(id) > 0
      ? $(`[data-action="${button.dataset.action === 'dec' ? 'dec' : 'inc'}"]`, action)
      : $('[data-action="add"]', action);
    next?.focus();
  }
}

productList.addEventListener('click', handleCartAction);
cartListEl.addEventListener('click', handleCartAction);

function bumpCounter() {
  cartCount.classList.remove('is-bumped');
  void cartCount.offsetWidth;
  cartCount.classList.add('is-bumped');
}

/* ---------- Уведомление ---------- */
const toast = $('#toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

/* =========================================================
   Фильтры и сортировка
   ========================================================= */
const filterButtons = $$('[data-filter]');
const sortSelect = $('#sort');
const catalogStatus = $('#catalog-status');
let currentFilter = 'all';

function applyCatalog() {
  const sorted = [...products.values()].sort((a, b) => {
    if (sortSelect.value === 'price-asc') return a.price - b.price;
    if (sortSelect.value === 'price-desc') return b.price - a.price;
    return a.index - b.index;
  });

  let visible = 0;
  sorted.forEach((product) => {
    const show = currentFilter === 'all' || product.type === currentFilter;
    product.item.hidden = !show;
    if (show) visible += 1;
    productList.append(product.item);
  });

  catalogStatus.textContent = `Показано ${visible} ${plural(visible, ['товар', 'товара', 'товаров'])}`;
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    applyCatalog();
  });
});

sortSelect.addEventListener('change', applyCatalog);

/* =========================================================
   Диалоги
   ========================================================= */
const orderDialog = $('#order-dialog');
let lastTrigger = null;

function openDialog(dialog, trigger) {
  lastTrigger = trigger || document.activeElement;
  dialog.showModal();
  document.body.classList.add('is-locked');
}

function closeDialog(dialog) {
  dialog.close();
}

[drawer, orderDialog].forEach((dialog) => {
  // Закрытие по клику на фон
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });

  $$('[data-close]', dialog).forEach((btn) => {
    btn.addEventListener('click', () => closeDialog(dialog));
  });

  dialog.addEventListener('close', () => {
    if (!drawer.open && !orderDialog.open) {
      document.body.classList.remove('is-locked');
      lastTrigger?.focus?.();
    }
  });
});

$('#cart-open').addEventListener('click', (event) => openDialog(drawer, event.currentTarget));

$('#cart-to-catalog').addEventListener('click', () => {
  closeDialog(drawer);
  $('#catalog').scrollIntoView();
});

$('#cart-clear').addEventListener('click', () => {
  if (confirm('Удалить все товары из корзины?')) cart.clear();
});

$('#checkout-open').addEventListener('click', () => {
  const trigger = lastTrigger;
  closeDialog(drawer);
  showOrderForm();
  openDialog(orderDialog, trigger);
});

$('#back-to-cart').addEventListener('click', () => {
  const trigger = lastTrigger;
  closeDialog(orderDialog);
  openDialog(drawer, trigger);
});

/* =========================================================
   Форма заказа
   ========================================================= */
const form = $('#order-form');
const orderView = $('#order-view');
const successView = $('#success-view');
const phoneInput = $('#phone');

function showOrderForm() {
  orderView.hidden = false;
  successView.hidden = true;
  renderSummary();
}

// Маска телефона: +7 (900) 000-00-00
phoneInput.addEventListener('input', () => {
  const raw = phoneInput.value;

  // Цифры после кода страны; +7 подставляется при фокусе
  let digits = (raw.startsWith('+7') ? raw.slice(2) : raw).replace(/\D/g, '');

  // Вставили номер целиком (8 900…, 7 900…, +7 900…) — отбрасываем код страны
  if (digits.length === 11 && /^[78]/.test(digits)) digits = digits.slice(1);
  digits = digits.slice(0, 10);

  let result = '+7';
  if (digits.length > 0) result += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += ')';
  if (digits.length > 3) result += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;
  phoneInput.value = result;
});

phoneInput.addEventListener('focus', () => {
  if (!phoneInput.value) phoneInput.value = '+7';
});

phoneInput.addEventListener('blur', () => {
  if (phoneInput.value === '+7') phoneInput.value = '';
});

// Подпись адреса зависит от способа доставки
$$('input[name="delivery"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    $('#address-label').textContent = radio.value === 'cdek'
      ? 'Адрес пункта СДЭК'
      : 'Адрес доставки';
    renderSummary();
  });
});

const errorMessages = {
  name: { valueMissing: 'Укажите имя', tooShort: 'Имя слишком короткое' },
  surname: { valueMissing: 'Укажите фамилию', tooShort: 'Фамилия слишком короткая' },
  phone: { valueMissing: 'Укажите телефон', patternMismatch: 'Введите номер полностью: +7 (900) 000-00-00' },
  address: { valueMissing: 'Укажите адрес', tooShort: 'Адрес слишком короткий' },
};

function validateField(field) {
  const rules = errorMessages[field.name];
  if (!rules) return true;

  field.value = field.value.trimStart();
  const { validity } = field;
  let message = '';

  // minlength не срабатывает для программно заданных значений — проверяем вручную
  const tooShort = field.minLength > 0 && field.value.trim().length > 0 && field.value.trim().length < field.minLength;

  if (validity.valueMissing || !field.value.trim()) message = rules.valueMissing;
  else if (tooShort) message = rules.tooShort;
  else if (validity.typeMismatch) message = rules.typeMismatch;
  else if (validity.patternMismatch) message = rules.patternMismatch;

  field.setAttribute('aria-invalid', String(Boolean(message)));
  $(`#${field.id}-error`).textContent = message;
  return !message;
}

$$('[required]', form).forEach((field) => {
  field.addEventListener('blur', () => {
    if (field.value) validateField(field);
  });
  field.addEventListener('input', () => {
    if (field.getAttribute('aria-invalid') === 'true') validateField(field);
  });
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  if (cart.count === 0) {
    showToast('Корзина пуста — добавьте товары');
    return;
  }

  const fields = $$('[required]', form);
  const invalid = fields.filter((field) => !validateField(field));

  if (invalid.length) {
    invalid[0].focus();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  const order = {
    number: `Л-${Date.now().toString().slice(-6)}`,
    ...data,
    items: cart.entries().map(({ id, name, price, qty }) => ({ id, name, price, qty })),
    subtotal: cart.subtotal,
    delivery: deliveryCost(),
  };
  order.total = order.subtotal + order.delivery;

  // Здесь будет отправка на сервер, например fetch('/api/orders', { method: 'POST', body: JSON.stringify(order) })
  console.info('Новый заказ', order);

  $('#success-title').textContent = 'Заказ создан!';
  $('#success-text').textContent =
    `${data.name}, номер вашего заказа ${order.number}, сумма ${formatPrice(order.total)}. Позвоним на ${data.phone} в течение часа, чтобы подтвердить доставку.`;

  orderView.hidden = true;
  successView.hidden = false;
  $('#success-title').focus();

  form.reset();
  $$('[aria-invalid]', form).forEach((f) => f.removeAttribute('aria-invalid'));
  $('#address-label').textContent = 'Адрес доставки';
  cart.clear();
});

/* =========================================================
   Старт
   ========================================================= */
render();
applyCatalog();
