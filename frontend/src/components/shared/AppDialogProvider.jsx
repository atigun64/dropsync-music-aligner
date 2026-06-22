import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const DialogContext = createContext(null);

function emptyValues(fields) {
  return Object.fromEntries(
    (fields || []).map((field) => [field.key, field.defaultValue ?? ""])
  );
}

function PromptDialog({ options, onResolve }) {
  const firstInputRef = useRef(null);
  const [values, setValues] = useState(() => emptyValues(options.fields));
  const [error, setError] = useState("");

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select?.();

    function onKeyDown(e) {
      if (e.key === "Escape") onResolve(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onResolve]);

  function updateField(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setError("");
  }

  function handleSubmit(e) {
    e?.preventDefault();

    for (const field of options.fields) {
      const raw = String(values[field.key] ?? "").trim();
      if (field.required !== false && !raw) {
        setError(`${field.label} is required`);
        return;
      }

      if (field.type === "number" || field.type === "decimal") {
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          setError(`${field.label} must be a number`);
          return;
        }
        if (field.min != null && num < field.min) {
          setError(`${field.label} must be at least ${field.min}`);
          return;
        }
        if (field.max != null && num > field.max) {
          setError(`${field.label} must be at most ${field.max}`);
          return;
        }
        if (field.validate) {
          const message = field.validate(num, raw);
          if (message) {
            setError(message);
            return;
          }
        }
      }
    }

    onResolve(values);
  }

  return (
    <div
      className="app-dialog-overlay"
      onMouseDown={() => onResolve(null)}
    >
      <div
        className={`app-dialog${options.fields.length > 2 ? " app-dialog--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-dialog__header">
          <h2 className="app-dialog__title" id="app-dialog-title">
            {options.title}
          </h2>
          <button
            type="button"
            className="app-dialog__close"
            onClick={() => onResolve(null)}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="app-dialog__body">
            {options.message ? (
              <p className="app-dialog__message">{options.message}</p>
            ) : null}

            {options.fields.map((field, index) => {
              const isDecimal = field.type === "decimal";
              const isNumber = field.type === "number";

              return (
              <label key={field.key} className="app-dialog__field">
                <span className="app-dialog__label">{field.label}</span>
                <input
                  ref={index === 0 ? firstInputRef : undefined}
                  className="input"
                  type={isDecimal ? "text" : isNumber ? "number" : "text"}
                  inputMode={isDecimal ? "decimal" : undefined}
                  value={values[field.key] ?? ""}
                  min={isNumber ? field.min : undefined}
                  max={isNumber ? field.max : undefined}
                  step={isNumber ? (field.step ?? "any") : undefined}
                  placeholder={field.placeholder}
                  onChange={(e) => updateField(field.key, e.target.value)}
                />
              </label>
            );
            })}

            {error ? <p className="app-dialog__error">{error}</p> : null}
          </div>

          <div className="app-dialog__footer">
            <button
              type="button"
              className="btn"
              onClick={() => onResolve(null)}
            >
              {options.cancelLabel || "Cancel"}
            </button>
            <button type="submit" className="btn btn--primary">
              {options.submitLabel || "OK"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({ options, onResolve }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onResolve(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onResolve]);

  return (
    <div className="app-dialog-overlay" onMouseDown={() => onResolve(false)}>
      <div
        className="app-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-dialog__header">
          <h2 className="app-dialog__title" id="app-dialog-title">
            {options.title}
          </h2>
        </div>

        <div className="app-dialog__body">
          <p className="app-dialog__message">{options.message}</p>
        </div>

        <div className="app-dialog__footer">
          <button type="button" className="btn" onClick={() => onResolve(false)}>
            {options.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            className={`btn${options.danger ? " btn--danger" : " btn--primary"}`}
            onClick={() => onResolve(true)}
            autoFocus
          >
            {options.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertDialog({ options, onResolve }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" || e.key === "Enter") onResolve();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onResolve]);

  return (
    <div className="app-dialog-overlay" onMouseDown={() => onResolve()}>
      <div
        className="app-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-dialog__header">
          <h2 className="app-dialog__title" id="app-dialog-title">
            {options.title}
          </h2>
        </div>

        <div className="app-dialog__body">
          <p className="app-dialog__message">{options.message}</p>
        </div>

        <div className="app-dialog__footer">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onResolve()}
            autoFocus
          >
            {options.okLabel || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const close = useCallback((result) => {
    setDialog((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const prompt = useCallback((options) => {
    return new Promise((resolve) => {
      setDialog({ type: "prompt", options, resolve });
    });
  }, []);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setDialog({ type: "confirm", options, resolve });
    });
  }, []);

  const alert = useCallback((options) => {
    return new Promise((resolve) => {
      setDialog({ type: "alert", options, resolve: () => resolve() });
    });
  }, []);

  const value = { prompt, confirm, alert };

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog?.type === "prompt" && (
        <PromptDialog options={dialog.options} onResolve={close} />
      )}
      {dialog?.type === "confirm" && (
        <ConfirmDialog options={dialog.options} onResolve={close} />
      )}
      {dialog?.type === "alert" && (
        <AlertDialog options={dialog.options} onResolve={close} />
      )}
    </DialogContext.Provider>
  );
}

export function useAppDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }
  return ctx;
}
