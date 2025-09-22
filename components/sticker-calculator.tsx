"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const PRICING = {
  product: "Wide Format",
  currency: "AUD",
  ratePerM2: 120,
  limits: {
    minWidthMm: 450,
    maxWidthMm: 1450,
    minHeightMm: 450,
    maxHeightMm: 5000,
  },
  steps: { sizeMm: 5 },
  includeSpacingMm: 0,
  qtyTiers: [50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000],
  baselineQty: 50,
  saveLadder: [
    { qty: 50, save: 0.0 },
    { qty: 100, save: 0.31 },
    { qty: 200, save: 0.49 },
    { qty: 300, save: 0.56 },
    { qty: 500, save: 0.63 },
    { qty: 1000, save: 0.69 },
    { qty: 2000, save: 0.74 },
    { qty: 3000, save: 0.76 },
    { qty: 5000, save: 0.78 },
    { qty: 10000, save: 0.81 },
  ],
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const snap = (v: number, step: number) => Math.round(v / step) * step

function wfPickSave(q: number) {
  let s = 0
  for (const step of PRICING.saveLadder) if (q >= step.qty) s = step.save
  return s // fraction (0..0.81)
}

function wfNextTier(q: number) {
  for (const t of PRICING.qtyTiers)
    if (q < t) {
      let s = 0
      for (const step of PRICING.saveLadder) if (t >= step.qty) s = step.save
      return { nextQty: t, nextSavePct: Math.round(s * 100) }
    }
  return null
}

function priceWideFormat({ widthMm, heightMm, qty }: { widthMm: number; heightMm: number; qty: number }) {
  const L = PRICING.limits,
    S = PRICING.steps,
    rate = PRICING.ratePerM2
  const w = snap(clamp(+widthMm || 0, L.minWidthMm, L.maxWidthMm), S.sizeMm)
  const h = snap(clamp(+heightMm || 0, L.minHeightMm, L.maxHeightMm), S.sizeMm)
  const q = Math.max(1, Math.floor(+qty || 1))

  // area and baseline per-unit (50-qty baseline)
  const effW = w + (PRICING.includeSpacingMm || 0)
  const effH = h + (PRICING.includeSpacingMm || 0)
  const areaM2 = (effW / 1000) * (effH / 1000)
  const baseUnit50 = areaM2 * rate

  const save = wfPickSave(q) // fraction
  const unitNow = baseUnit50 * (1 - save) // discounted per-unit
  const total = unitNow * q

  return {
    size: { widthMm: w, heightMm: h, standard: false },
    qty: q,
    areaM2: +areaM2.toFixed(6),
    pricingMode: "area-based",
    tierUsed: null,
    baseUnit50: +baseUnit50.toFixed(4),
    unitPrice: +unitNow.toFixed(4),
    totalPrice: +total.toFixed(2),
    savePct: Math.round(save * 100),
    nextTier: wfNextTier(q),
  }
}

export default function StickerCalculator() {
  const [customWidth, setCustomWidth] = useState<number | null>(null)
  const [customHeight, setCustomHeight] = useState<number | null>(null)
  const [selectedQuantity, setSelectedQuantity] = useState<number | null>(null)
  const [customQuantity, setCustomQuantity] = useState<number | null>(null)
  const [showCustomQuantity, setShowCustomQuantity] = useState(false)
  const [selectedFinish, setSelectedFinish] = useState("")
  const [isReorder, setIsReorder] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [artworkMethod, setArtworkMethod] = useState("")
  const [shippingMethod, setShippingMethod] = useState("13.95")
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [currentStep, setCurrentStep] = useState<"configure" | "details">("configure")

  const width = customWidth || 0
  const height = customHeight || 0
  const quantity = customQuantity || selectedQuantity || 0

  let pricingResult = null
  let total = 0
  let unitPrice = 0
  let upsellMsg = ""

  if (width > 0 && height > 0 && quantity > 0) {
    try {
      pricingResult = priceWideFormat({
        widthMm: width,
        heightMm: height,
        qty: quantity,
      })

      const normalTotal = pricingResult.totalPrice

      total = normalTotal
      unitPrice = pricingResult.unitPrice

      if (pricingResult.nextTier) {
        upsellMsg = `Save ${pricingResult.nextTier.nextSavePct}% when you add ${pricingResult.nextTier.nextQty - quantity} stickers`
      } else if (pricingResult.savePct > 0) {
        upsellMsg = `You saved ${pricingResult.savePct}%`
      }
    } catch (error) {
      console.error("Pricing error:", error)
    }
  }

  let shippingCost = 0
  let shippingMessage = ""

  if (total > 0) {
    if (total < 60) {
      shippingCost = Number.parseFloat(shippingMethod)
      shippingMessage = "Choose between Express or Standard Shipping."
    } else if (total >= 60 && total < 100) {
      shippingCost = 0
      shippingMessage = "You have received free Standard Shipping."
    } else if (total >= 100) {
      shippingCost = 0
      shippingMessage = "You have received free Express Shipping."
    }
  }

  const finalTotal = total + shippingCost

  useEffect(() => {
    const savedImages = localStorage.getItem("sticker-artwork-images")
    if (savedImages) {
      setUploadedImages(JSON.parse(savedImages))
    }
  }, [])

  useEffect(() => {
    if (uploadedImages.length > 0) {
      localStorage.setItem("sticker-artwork-images", JSON.stringify(uploadedImages))
    } else {
      localStorage.removeItem("sticker-artwork-images")
    }
  }, [uploadedImages])

  useEffect(() => {
    if (total >= 100) {
      setShippingMethod("0") // Free Express
    } else if (total >= 60) {
      setShippingMethod("0") // Free Standard
    } else {
      if (shippingMethod === "0") {
        setShippingMethod("13.95")
      }
    }
  }, [total])

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    const newImageUrls: string[] = []

    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split(".").pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

        const { data, error } = await supabase.storage.from("artwork-files").upload(fileName, file)

        if (error) {
          console.error("Upload error:", error)
          alert(`Failed to upload ${file.name}. Please try again.`)
          continue
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("artwork-files").getPublicUrl(fileName)

        newImageUrls.push(publicUrl)
      }

      if (newImageUrls.length > 0) {
        setUploadedImages((prev) => [...prev, ...newImageUrls])
      }
    } catch (error) {
      console.error("Error uploading images:", error)
      alert("Upload failed. Please check your connection and try again.")
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  const removeImage = (imageUrl: string) => {
    setUploadedImages((prev) => prev.filter((url) => url !== imageUrl))
  }

  const handleContinue = () => {
    if (currentStep === "configure") {
      setCurrentStep("details")
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    setCurrentStep("configure")
  }

  const handleSubmit = () => {
    console.log("Form submitted - Ready to order!")
  }

  const isFormReady = customWidth && customHeight && (selectedQuantity || customQuantity)

  return (
    <main className="min-h-screen bg-gray-50 p-2 sm:p-4 flex items-center justify-center">
      <div className="w-full max-w-xs sm:max-w-md lg:max-w-xl xl:max-w-2xl bg-white rounded-lg p-3 sm:p-6 lg:p-8 shadow-sm border border-gray-200">
        <form className="space-y-3 sm:space-y-6">
          {currentStep === "configure" && (
            <>
              <div className="space-y-2">
                <label className="text-gray-700 font-medium text-xs sm:text-sm">Dimensions (mm)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Width (450-1450)"
                    min="450"
                    max="1450"
                    step="5"
                    className="border border-gray-300 rounded-md p-2 w-1/2 text-sm sm:text-base"
                    value={customWidth ?? ""}
                    onChange={(e) => setCustomWidth(Number(e.target.value) || null)}
                  />
                  <input
                    type="number"
                    placeholder="Height (450-5000)"
                    min="450"
                    max="5000"
                    step="5"
                    className="border border-gray-300 rounded-md p-2 w-1/2 text-sm sm:text-base"
                    value={customHeight ?? ""}
                    onChange={(e) => setCustomHeight(Number(e.target.value) || null)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="quantity" className="text-gray-700 font-medium text-xs sm:text-sm">
                  Quantity
                </label>
                <select
                  id="quantity"
                  value={showCustomQuantity ? "custom" : selectedQuantity || ""}
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      setShowCustomQuantity(true)
                      setSelectedQuantity(null)
                    } else {
                      setShowCustomQuantity(false)
                      setSelectedQuantity(Number(e.target.value) || null)
                      setCustomQuantity(null)
                    }
                  }}
                  className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-gray-900 bg-white appearance-none text-sm sm:text-base"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: "right 0.5rem center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "1.5em 1.5em",
                  }}
                >
                  <option value="">Select</option>
                  {(() => {
                    if (width > 0 && height > 0) {
                      return PRICING.qtyTiers
                        .map((qty) => {
                          try {
                            const result = priceWideFormat({ widthMm: width, heightMm: height, qty })
                            return (
                              <option key={qty} value={qty}>
                                {qty} stickers • ${result.totalPrice}
                              </option>
                            )
                          } catch {
                            return null
                          }
                        })
                        .filter(Boolean)
                    } else {
                      return PRICING.qtyTiers.map((q) => (
                        <option key={q} value={q}>
                          {q} stickers
                        </option>
                      ))
                    }
                  })()}
                  <option value="custom">Custom quantity</option>
                </select>

                {showCustomQuantity && (
                  <input
                    type="number"
                    min={1}
                    placeholder="Enter quantity"
                    className="border border-gray-300 rounded-md p-2 w-full mt-2 text-sm sm:text-base"
                    value={customQuantity ?? ""}
                    onChange={(e) => setCustomQuantity(Number(e.target.value) || null)}
                  />
                )}

                {quantity > 0 && upsellMsg && (
                  <div className="text-green-600 text-xs sm:text-sm font-medium">{upsellMsg}</div>
                )}
              </div>
            </>
          )}

          {currentStep === "details" && (
            <>
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-xs sm:text-sm"
              >
                ← Back
              </button>

              <div>
                <label htmlFor="finish" className="text-gray-700 font-medium text-xs sm:text-sm block mb-2">
                  Finish
                </label>
                <select
                  id="finish"
                  value={selectedFinish}
                  onChange={(e) => setSelectedFinish(e.target.value)}
                  className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-gray-900 bg-white text-sm sm:text-base"
                >
                  <option value="">-- Select --</option>
                  <option value="super-ninja-glossy">
                    Super Ninja Glossy - 100% weather resistant / dishwasher safe!
                  </option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="reorder"
                  checked={isReorder}
                  onChange={(e) => setIsReorder(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="reorder" className="text-gray-700 font-medium text-xs sm:text-sm">
                  Is this a reorder?
                </label>
              </div>

              {isReorder && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="invoice-number" className="text-gray-700 font-medium text-xs sm:text-sm block mb-2">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      id="invoice-number"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="Enter your invoice number"
                      className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-gray-900 text-sm sm:text-base"
                    />
                  </div>

                  {invoiceNumber.trim() && (
                    <button
                      type="button"
                      className="bg-blue-500 text-white px-3 sm:px-4 py-2 rounded-md hover:bg-blue-600 transition-colors text-xs sm:text-sm font-medium"
                    >
                      Skip proof
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="text-gray-700 font-medium text-xs sm:text-sm block mb-3">
                  How will your print ready artwork be supplied?
                </label>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className={`px-3 py-2 border border-gray-300 rounded font-medium cursor-pointer text-xs sm:text-sm ${
                      artworkMethod === "ready" ? "bg-black text-white" : "bg-gray-100 text-black"
                    }`}
                    onClick={() => setArtworkMethod("ready")}
                  >
                    I have print-ready files
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 border border-gray-300 rounded font-medium cursor-pointer text-xs sm:text-sm ${
                      artworkMethod === "design" ? "bg-black text-white" : "bg-gray-100 text-black"
                    }`}
                    onClick={() => setArtworkMethod("design")}
                  >
                    Design my own online
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 border border-gray-300 rounded font-medium cursor-pointer text-xs sm:text-sm ${
                      artworkMethod === "help" ? "bg-black text-white" : "bg-gray-100 text-black"
                    }`}
                    onClick={() => setArtworkMethod("help")}
                  >
                    I need design assistance
                  </button>
                </div>
              </div>

              {artworkMethod === "ready" && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 sm:p-4 text-center bg-gray-50 hover:bg-gray-100 transition-colors">
                    <label
                      htmlFor="upload-artwork"
                      className="block cursor-pointer text-gray-700 font-medium text-xs sm:text-sm"
                    >
                      {isUploading ? "Uploading..." : "Click to upload artwork"}
                    </label>
                    <input
                      type="file"
                      id="upload-artwork"
                      name="upload-artwork"
                      className="hidden"
                      multiple
                      accept=".ai,.eps,.pdf,.png,.jpg,.jpeg"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                    <div className="mt-2 text-xs text-gray-500">
                      Accepted file types: ai, eps, pdf, png, jpg. Max: 250MB
                    </div>
                  </div>

                  {uploadedImages.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {uploadedImages.map((imageUrl, index) => (
                        <div key={index} className="relative group">
                          <div className="aspect-square border border-gray-300 rounded-lg overflow-hidden bg-gray-50">
                            <img
                              src={imageUrl || "/placeholder.svg"}
                              alt={`Uploaded artwork ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeImage(imageUrl)}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold hover:bg-red-600 transition-colors"
                            title="Remove image"
                          >
                            ❌
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {artworkMethod === "design" && (
                <div className="p-4 border border-gray-300 rounded bg-gray-50">
                  <p className="text-gray-700 text-sm">Redirecting to Antigro Designer...</p>
                </div>
              )}

              {artworkMethod === "help" && (
                <div className="p-4 border border-gray-300 rounded bg-gray-50">
                  <p className="text-gray-700 text-sm">Feature coming soon...</p>
                </div>
              )}

              <div>
                <label htmlFor="shipping-method" className="text-gray-700 font-medium text-xs sm:text-sm block mb-2">
                  Shipping Method
                </label>
                <select
                  id="shipping-method"
                  value={shippingMethod}
                  onChange={(e) => setShippingMethod(e.target.value)}
                  className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-gray-900 bg-white text-sm sm:text-base"
                  disabled={total >= 60}
                >
                  {total >= 100 ? (
                    <option value="0">Express Shipping - FREE</option>
                  ) : total >= 60 ? (
                    <option value="0">Standard Shipping - FREE</option>
                  ) : (
                    <>
                      <option value="8.95">Standard Shipping - $8.95</option>
                      <option value="13.95">Express Shipping - $13.95</option>
                    </>
                  )}
                </select>
                {shippingMessage && (
                  <div className="text-green-600 text-xs sm:text-sm mt-2 font-medium">{shippingMessage}</div>
                )}
              </div>
            </>
          )}

          <div className="border-t border-gray-200 pt-4 sm:pt-6">
            <div className="flex justify-between items-center mb-4">
              <div className="text-2xl sm:text-4xl font-bold text-gray-900">${finalTotal.toFixed(2)}</div>
              <div className="text-gray-600 text-xs sm:text-sm">
                ${quantity > 0 ? (finalTotal / quantity).toFixed(2) : "0.00"} / sticker
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              className={`w-full font-semibold py-3 px-4 rounded-md transition-colors text-sm sm:text-base ${
                isFormReady ? "bg-black text-white hover:bg-gray-800" : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
              disabled={!isFormReady}
            >
              {currentStep === "configure" ? "Continue" : "Ready to order?"}
            </button>

            {currentStep === "configure" && (
              <div className="text-center text-gray-500 text-xs sm:text-sm mt-2">Next: upload artwork →</div>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}
