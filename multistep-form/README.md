# Multi-Step Form

Turns any Webflow form into a multi-step form using only attributes. Works with native Webflow form
submission and with Lumos components (attributes via the components' Attribute Name/Value props).

## Embed

Put this in an **Embed** element on the pages that need it (or inside the form component itself).
Loading it twice on a page is safe.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@1.0.0/multistep-form/multistep-form.min.css">
<script defer src="https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@1.0.0/multistep-form/multistep-form.min.js"></script>
```

Optional, for non-German sites (place **before** the script tag):

```html
<script>
  window.MSF_MESSAGES = {
    required: 'Please fill in this field.',
    email: 'Please enter a valid email address.',
    match: 'The entries do not match.',
    minChecked: 'Please select at least {n} option(s).',
    maxChecked: 'Please select at most {n} option(s).'
  };
</script>
```

## Attributes

### Form

| Attribute | On | Effect |
| --- | --- | --- |
| `data-msf="form"` | `<form>` (or a wrapper containing it) | Activates the script |
| `data-msf-offset="120"` | form | Scroll offset in px (e.g. for a fixed nav) |
| `data-msf-scroll="false"` | form | Don't scroll to the step on change |
| `data-msf-animate` | form | Fade/slide in each step |
| `data-msf-save` | form | Keep entries in localStorage until submitted |
| `data-msf-clickable` | form | Indicators can be clicked to jump to steps |
| `data-msf="wrapper"` | element around form + outside controls | Scope for buttons/progress placed outside the form |

### Steps and buttons

| Attribute | Effect |
| --- | --- |
| `data-msf="step"` | One step. Only the current step is shown |
| `data-msf-if="name=value\|value2 && other!=x"` | Step is only included when the condition is true |
| `data-msf-title="…"` | Title shown in `data-msf="step-title"` |
| `data-msf="next"` | Validates the step and goes forward (hidden on the last step) |
| `data-msf="prev"` | Goes back (hidden on the first step) |
| `data-msf="submit"` | Shown only on the last active step. Must be a real submit button |

Put all three buttons in every step; the script shows the right ones. Pressing Enter on an earlier step goes to the next step instead of submitting.

### Progress

| Attribute | Effect |
| --- | --- |
| `data-msf="indicator"` | One per step, gets `is-active` / `is-complete` classes |
| `data-msf="progress-bar"` | Width is set to the progress percentage |
| `data-msf="current"` / `data-msf="total"` | Text: current step number / number of steps |
| `data-msf="step-title"` | Text: the current step's `data-msf-title` |
| CSS variable `--msf-progress` | Progress percentage, set on the scope element |

### Fields and validation

Native validation settings (required, type, min/max, pattern) are respected. Extras:

| Attribute | Effect |
| --- | --- |
| `data-msf="field"` | Wrapper that receives the error message and `is-invalid` class |
| `data-msf="error"` | Element inside the wrapper where the message goes (otherwise one is created) |
| `data-msf-message="…"` | Custom error message for this field |
| `data-msf-match="otherName"` | Must equal another field (e.g. email confirmation), message via `data-msf-match-message` |
| `data-msf="group"` + `data-msf-min` / `data-msf-max` | Min/max number of checked checkboxes in the group |
| `data-msf-ignore` | Field (or container) is skipped by validation |

### Summary

| Attribute | Effect |
| --- | --- |
| `data-msf-summary="fieldName"` | Shows the field's value(s), e.g. on a confirmation step |
| `data-msf-empty="–"` | Text when the field is empty |
| `data-msf-label="…"` | On a checkbox/radio: label to show instead of its value |

## JavaScript

- `window.MultiStepForm.init()` re-scans the page (for forms added later).
- Event `msf:change` on the form, `event.detail = { step, index, total, isLast }`.
- The form element gets `data-msf-current="n"` and `data-msf-ready` once initialised.
