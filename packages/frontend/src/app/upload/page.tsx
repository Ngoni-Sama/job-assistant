import { CVUpload } from "@/components/CVUpload";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload CV</h1>
        <p className="text-sm text-gray-500">
          Your CV is converted to Markdown by Cloudflare Workers AI, then used to score job matches.
        </p>
      </div>
      <CVUpload />
    </div>
  );
}
