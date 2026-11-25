# Multi-Step Form

Turns any Webflow form into a multi-step form using only attributes. Works with Lumos components
(attributes via the components' Attribute Name/Value props).

Since 2.0 it needs the [form handler](../form-handler/), which does the validation, phone formatting,
spam protection and sending. Without an endpoint, Webflow submits the form as usual; with
`data-fh-endpoint` the data goes to the form proxy / Make instead.

## Embed

Put this in an **Embed** element on the pages that need it (or inside the form component itself).
Loading it twice on a page is safe.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@2.2.0/form-handler/form-handler.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@2.2.0/multistep-form/multistep-form.min.css">
<script defer src="https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@2.2.0/form-handler/form-handler.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@2.2.0/multistep-form/multistep-form.min.js"></script>
```

Use the exact version of the latest release (see `CHANGELOG.md`), not `@2`: browsers cache alias URLs for up to
7 days, exact versions are updated the moment the embed changes. Version 1 (`@1.1.0`, without the form handler) keeps working unchanged.

Optional, for non-German sites (place **before** the script tag):

```html
<script>
  window.FH_MESSAGES = {
    required: 'Please fill in this field.',
    email: 'Please enter a valid email address.',
    phone: 'Please enter a valid phone number including area code.',
    match: 'The entries do not match.',
    minChecked: 'Please select at least {n} option(s).',
    maxChecked: 'Please select at most {n} option(s).',
    sendError: 'Sorry, something went wrong. Please try again.'
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
| `data-msf-save` | form | Keep entries in localStorage until submitted, for 1 day after the last edit. `data-msf-save="3"` = 3 days |
| `data-msf-clickable` | form | Indicators can be clicked to jump to steps |
| `data-msf-history="false"` | form | Turn off browser back/forward = previous/next step (on by default) |
| `data-msf-honeypot` / `data-fh-honeypot` | form | Spam protection (handled by the form handler): hidden trap field + submits faster than 3 s are dropped. `="5"` = 5 s |
| `data-fh-endpoint="…"` | form | Send to the form proxy instead of Webflow, see [form handler](../form-handler/README.md) |
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

Validation is done by the form handler. Both prefixes work (`data-msf-…` and `data-fh-…`).
Native validation settings (required, type, min/max, pattern) are respected. Extras:

| Attribute | Effect |
| --- | --- |
| `data-msf="field"` | Wrapper that receives the error message and `is-invalid` class |
| `data-msf="error"` | Element inside the wrapper where the message goes (otherwise one is created) |
| `data-msf-message="…"` | Custom error message for this field |
| `data-msf-match="otherName"` | Must equal another field (e.g. email confirmation), message via `data-msf-match-message` |
| `data-msf="group"` + `data-msf-min` / `data-msf-max` | Min/max number of checked checkboxes in the group |
| `data-msf-ignore` | Field (or container) is skipped by validation |
| `data-msf-nosave` | Field (or container) is never written to localStorage (`data-msf-save`) |

### Phone numbers

Every `type="tel"` field is checked and normalized automatically (empty optional fields are skipped).

| Input | Result |
| --- | --- |
| `0151 23456789`, `0151-234 567 89` | `+49 151 23456789` |
| `0049 151 …`, `+49 (0)151 …`, `+49 0151 …` | `+49 151 23456789` |
| `034242 12345` | `+49 3424212345` |
| `+43 664 1234567` | `+436641234567` |
| `+49 34242`, `0151 234`, `15123456789`, letters | invalid |

Phone fields also get `inputmode="tel"` and `autocomplete="tel"` if they don't have them.

Rules: a number needs a leading `0`, `00` or `+`. German mobile numbers (015x/016x/017x) need 10–11 digits,
other German numbers 7–12 digits after `+49`, foreign numbers 8–15 digits in total.
The value is rewritten when the field loses focus and before a step change or submit, so the submission always contains the `+49` form.

| Attribute | Effect |
| --- | --- |
| `data-msf-phone="false"` | On a `type="tel"` field: turn the check off |
| `data-msf-phone` | On any other input: turn the check on |
| `data-msf-phone-country="43"` | On field, wrapper or form: country code used for numbers starting with `0` (default `49`) |

### Summary

| Attribute | Effect |
| --- | --- |
| `data-msf-summary="fieldName"` | Shows the field's value(s), e.g. on a confirmation step |
| `data-msf-empty="–"` | Text when the field is empty |
| `data-msf-label="…"` | On a checkbox/radio: label to show instead of its value |

## Browser back button

Each step change adds a browser history entry (no URL or hash change). Back goes to the previous step,
Forward to the next one, but only if the steps in between are valid. Turn off with `data-msf-history="false"`.

## Spam protection

With `data-msf-honeypot` the form handler adds a hidden field that people never see. If it's filled in, or the form
is submitted less than 3 seconds after the page loaded, it shows Webflow's success message but sends
nothing (event `fh:spam`). The field never shows up in submissions.
This only stops bots that run JavaScript; the form proxy checks the honeypot again on the server.

## JavaScript

- `window.MultiStepForm.init()` re-scans the page (for forms added later).
- Sending events come from the form handler: `fh:send`, `fh:success`, `fh:error`, `fh:spam`.
- Event `msf:change` on the form, `event.detail = { step, index, total, isLast }`.
- The form element gets `data-msf-current="n"` and `data-msf-ready` once initialised.

## Tests

```bash
node test/phone.test.js
```

Browser test page: start the test server from the repo root (`node test/server.mjs`) and open
`http://localhost:8765/test/index.html`. Append `?minTime=0` to turn off the 3-second check and
`&endpoint=/f/ok` to send through the fake proxy instead of the fake Webflow handler.
