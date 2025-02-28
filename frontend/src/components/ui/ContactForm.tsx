import React, { FC, useState } from 'react';

interface ContactFormProps {
  onSubmit: (data: { name: string; email: string; message: string }) => void;
  className?: string;
  loading?: boolean;
  successMessage?: string;
  errorMessage?: string;
}

export const ContactForm: FC<ContactFormProps> = ({
  onSubmit,
  className = '',
  loading = false,
  successMessage = '',
  errorMessage = '',
}) => {
  const [formData, setFormData] = useState({
    name: '',
  email: '',
  message: '',
});

const handleChange = (
  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
) => {
  const { name, value } = e.target;
  setFormData(prev => ({
    ...prev,
    [name]: value,
  }));
};

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  onSubmit(formData);
};

return (
  <form
    className={`space-y-4 ${className}`}
    onSubmit={handleSubmit}
    noValidate
  >
    <div>
      <label
        htmlFor="name"
        className="block text-sm font-medium text-gray-700"
      >
        Name
      </label>
      <input
        type="text"
        id="name"
        name="name"
        value={formData.name}
        onChange={handleChange}
        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500"
        required
      />
    </div>

    <div>
      <label
        htmlFor="email"
        className="block text-sm font-medium text-gray-700"
      >
        Email
      </label>
      <input
        type="email"
        id="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500"
        required
      />
    </div>

    <div>
      <label
        htmlFor="message"
        className="block text-sm font-medium text-gray-700"
      >
        Message
      </label>
      <textarea
        id="message"
        name="message"
        value={formData.message}
        onChange={handleChange}
        rows={4}
        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500"
        required
      />
    </div>

    <div>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex justify-center rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {loading ? 'Submitting...' : 'Submit'}
      </button>
    </div>

    {successMessage && (
      <div className="text-sm text-green-600">{successMessage}</div>
    )}

    {errorMessage && (
      <div className="text-sm text-red-600">{errorMessage}</div>
    )}
  </form>
);
};

export default ContactForm;
