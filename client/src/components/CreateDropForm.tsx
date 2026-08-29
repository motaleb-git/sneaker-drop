import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { HttpError, notifyError } from "../lib/errors";
import { useDropsStore } from "../store/dropsStore";
import {
  validateDropName,
  validatePrice,
  validateStock,
} from "../lib/validation";
import { Field, inputClass } from "./Field";

type FieldErrors = {
  name?: string;
  price?: string;
  stock?: string;
};

export function CreateDropForm() {
  const addDrop = useDropsStore((s) => s.addDrop);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("180");
  const [stock, setStock] = useState("10");
  const [startsNow, setStartsNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  function validate(): FieldErrors {
    return {
      name: validateDropName(name),
      price: validatePrice(price),
      stock: validateStock(stock),
    };
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (next.name || next.price || next.stock) {
      toast.error("Fix the highlighted fields");
      return;
    }

    const priceCents = Math.round(Number(price) * 100);
    const totalStock = Number(stock);

    setSubmitting(true);
    try {
      const { drop } = await api.createDrop({
        name: name.trim(),
        priceCents,
        totalStock,
        startsAt: startsNow
          ? new Date().toISOString()
          : new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      addDrop(drop);
      toast.success("Drop created");
      setName("");
      setPrice("180");
      setStock("10");
      setErrors({});
      setOpen(false);
    } catch (err) {
      if (err instanceof HttpError && err.fields) {
        setErrors({
          name: err.fields.name,
          price: err.fields.priceCents,
          stock: err.fields.totalStock,
        });
      }
      notifyError(err, "Could not create the drop.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">New merch drop</p>
          <p className="text-xs text-slate-400">Add a product with name, price, and starting stock</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setErrors({});
          }}
          className={
            open
              ? "rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200"
              : "rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950"
          }
        >
          {open ? "Cancel" : "+ Create drop"}
        </button>
      </div>
      {open && (
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 grid gap-3 sm:grid-cols-4" noValidate>
          <Field label="Product name" error={errors.name} className="sm:col-span-2">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="Air Jordan 1"
              maxLength={120}
              className={inputClass(errors.name)}
            />
          </Field>
          <Field label="Price (USD)" error={errors.price}>
            <input
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setErrors((prev) => ({ ...prev, price: undefined }));
              }}
              type="number"
              min="0"
              step="0.01"
              placeholder="180.00"
              className={inputClass(errors.price)}
            />
          </Field>
          <Field label="Stock units" error={errors.stock}>
            <input
              value={stock}
              onChange={(e) => {
                setStock(e.target.value);
                setErrors((prev) => ({ ...prev, stock: undefined }));
              }}
              type="number"
              min="1"
              step="1"
              placeholder="10"
              className={inputClass(errors.stock)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-3">
            <input
              type="checkbox"
              checked={startsNow}
              onChange={(e) => setStartsNow(e.target.checked)}
            />
            Start immediately (off = live in 10 minutes)
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Publish drop"}
          </button>
        </form>
      )}
    </section>
  );
}
