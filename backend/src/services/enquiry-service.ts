import { queryDatabase } from "../database.js";

type VehicleEnquiry = {
  customerName: string;
  mobileNumber: string;
  vehicleCategory: string;
  makeName: string;
  modelName: string;
  manufacturingYear?: number;
  fuelType?: string;
  approximateLocation: string;
  vehicleCondition?: string;
  additionalNotes?: string;
};

type ContactEnquiry = {
  customerName: string;
  mobileNumber: string;
  email?: string;
  message: string;
};

export async function createVehicleEnquiry(enquiry: VehicleEnquiry) {
  const result = await queryDatabase(
    `INSERT INTO vehicle_purchase_enquiries
      (customer_name, mobile_number, vehicle_category, make_name, model_name,
       manufacturing_year, fuel_type, approximate_location, vehicle_condition, additional_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, created_at`,
    [
      enquiry.customerName, enquiry.mobileNumber, enquiry.vehicleCategory,
      enquiry.makeName, enquiry.modelName,
      enquiry.manufacturingYear ?? null, enquiry.fuelType ?? null,
      enquiry.approximateLocation, enquiry.vehicleCondition ?? null, enquiry.additionalNotes ?? null
    ]
  );
  return result.rows[0];
}

export async function createContactEnquiry(enquiry: ContactEnquiry) {
  const result = await queryDatabase(
    `INSERT INTO contact_enquiries (customer_name, mobile_number, email, message)
     VALUES ($1,$2,$3,$4)
     RETURNING id, created_at`,
    [enquiry.customerName, enquiry.mobileNumber, enquiry.email ?? null, enquiry.message]
  );
  return result.rows[0];
}
