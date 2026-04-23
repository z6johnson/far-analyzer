"use client";

import { useDropzone } from "react-dropzone";

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
};

export function Dropzone({ onFile, disabled }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"], "text/plain": [".txt"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled,
    onDrop: (files) => files[0] && onFile(files[0]),
  });

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center border border-dashed px-8 py-16 transition-colors ${
        isDragActive
          ? "border-neutral-900 bg-neutral-50"
          : "border-neutral-300 hover:border-neutral-600"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input {...getInputProps()} />
      <p className="display-tight text-lg text-neutral-900">
        {isDragActive ? "Drop to analyze" : "Drop contract PDF here"}
      </p>
      <p className="mt-3 text-sm text-neutral-600">or</p>
      <button
        type="button"
        className="mt-3 bg-neutral-900 px-4 py-2 text-sm font-bold uppercase tracking-wider text-white hover:bg-neutral-800"
      >
        Browse Files
      </button>
      <p className="label-caps mt-6">PDF or TXT · 10 MB Max</p>
    </div>
  );
}
