import admin from 'firebase-admin';
import {getFirestore} from "firebase-admin/firestore";
import {GoogleGenerativeAI} from '@google/generative-ai';
import fs from 'fs';
import moment from 'moment';

import serviceAccount  from "./daging.json" with {type:'json'}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Optionally, you can add other Firebase config here.
});




const db = getFirestore();

//get ke
const keys = await db.collection("keys").doc("gemini").get();
const geminiKey = keys.data().key;
// first get all data that still has read = false


async function extractPrices(companyId,companyName,alldata){
    const genAI = new GoogleGenerativeAI(geminiKey)

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
});

const generationConfig = {
  temperature: 0.5,
  responseMimeType: "application/json",
};


const prompt = (textExtract)=>`You are a JSON data extraction expert. Analyze the text below and output EXCLUSIVELY valid JSON in this exact structure:

[{ 

"MeatType": "Specific meat type from approved list",  
"Brands": "Exact brand name from approved list",  
"Prices": integer value following conversion rules  
}]

# Instruction


- only extract meats prices lists from origin of India
    
- this the brands originate from India : ALLANA, AMROON, ALDUA, ALQURESH, AMBER, BLACK GOLD, RUSTAM, MASH,ALM,ALALI
    
- Group the Meat type based on these types:  
    Veal Trunk, Sirloin, Chucktender, Sengkel, Knuckle, Lean Trimming, Swalow Meat, Membrane, Fat Brisket, Heart, Feet, Lung, Liver, Lips, Tongue, Ligamentum, Tendon, Cheek Meat, Head Meat, Necktrim, Tongueroot, Short Plate, Brisket, Rib End, Rib Blade, Blade,Short Ribs, Chuck Short, Ribs Plate, Back Ribs, Spare Rib, Scapula, Chuckribs, Brisket Bone, Leg Bone, Patela, Verterbrae, Chine Bone, Neck Bone, CM01,WM200, Roll, Roll Kw,Bulpack,Cube Roll,Rump,Outside,Topside,Tenderloin,Slice,Silverside,Flank,Striploin
- Please compare the meat type in the text with group of Meat Type above, ignore the Uppercase and lowercase in the text, just compare the similarity
- Because of this is type by human, sometime they were making a typos, find the closest word for Meat Type as categories above, for example thunderloin should be written tenderloin
    

# EXAMPLES

Input Text: "Anzco Veal Trunk 82.5/kg | Alliance Chucktender 87500 | Greenlea/Teys Sirloin 92.3"  
Output:  
[  
{"MeatType":"Veal Trunk","Brands":"Anzco","Prices":82500},  
{"MeatType":"Chucktender","Brands":"Alliance","Prices":87500},  
{"MeatType":"Sirloin","Brands":"Greenlea","Prices":92300},  
{"MeatType":"Sirloin","Brands":"Teys","Prices":92300}  
]

# RULES

1. PRICE CONVERSION:
    
    - 72.5 → 72500
        
    - 87.500 → 87500
        
    - 92.3 → 92300
        
    - Always convert to integer with two added zeros after removing decimal
        
2. MULTIPLE BRANDS:
    
    - "Alliance/Greenlea" → Create separate entries for both brands
        
3. SPECIAL CASES:
    
    - "bb" in brand names → Ignore (e.g., "bb Alliance" → "Alliance")
        
    - "KNK" → "Knuckle"
        
    - "Sengkel pis2an" → "Sengkel"
        
    - "Lockyer Valley" → "Lockyer"
        
    - "Lontong" -> Roll
    - "Lontong KW"  -> Roll Kw
    - "Lontong CM"-> CM01
    - "Tempe" -> Slice
        
4. FORMATTING:
    
    - Output ONLY valid JSON array
        
    - No additional text or explanations
        
    - Maintain uppercase for country names
        
    - Use exact brand/meat type spellings from approved lists

5. Brand Similarity:
    - Ignore the Uppercase and lowercase in the text, just compare the similarity
    - Such as AL ALI should be written ALALI
    - If the brand is not in approved list, ignore it
    - Such as AL QURAIS should be written ALQURESH and also AL QURESH should be written also ALQURESH
    - Such as Alqures should be written ALQURESH
    - Such as Allana new should be written ALLANA
    - Such as Amron should be written AMROON
        

## Text to be Extracted:
 ${textExtract}
`
const chatSession = model.startChat({
    generationConfig,
    history: [

    ],
  });


let totalUpdate =0

for (const doc of alldata.docs) {
  const data = doc.data()
  const docId = doc.id
  const start = Date.now()
    const Country = "India"
   const Timestamp = data.timestamp
  if (data.message.includes(companyId)){

      const Company = companyName

    const textPrompt = prompt( data.message)

    const geminiStream = await chatSession.sendMessageStream(textPrompt);

let completeResponse = "";
console.log("receiving streamm")
  for await (const chunk of geminiStream.stream) {
    completeResponse += chunk.text();
  }

 let jsonData;
  const jsonMatch = completeResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    try {
    // If JSON is wrapped in code blocks, extract and parse it
    const jsonString = jsonMatch ? jsonMatch[1].trim() : completeResponse.trim();
    jsonData = JSON.parse(jsonString);

  } catch (error) {
    console.error("Failed to parse JSON:", error);
    console.log("Raw response:", completeResponse);
    return null;
  }



	console.log("Got the data back from AI")
	const PromiseData = []

	jsonData.forEach((data)=>{
        let customizedData = {

          Country, Company,Timestamp,...data
        }
		PromiseData.push(
			db.collection("pricesData").add(customizedData)
		)
	})

	Promise.all(PromiseData)
	console.log("data inserted")

    await db.collection("groupMessages").doc(docId).update({
    readIndia:true
  })
  const end = Date.now()
  console.log("Time taken", (end - start)/1000,"s")
    totalUpdate++
}


}
console.log(`Total updated ${companyName} data`, totalUpdate)
}

async function readIndia () {
  console.log("Read India Meat Type")
  const arrayCompanyId=["Cabang Duri Kosambi","*Cabang Karawaci*","E M S","CITRA SUMBER NUSANTARA","ARDHANA PERMATA ANUGERAH","Hijrahfood","https://maps.app.goo.gl/FuM13jLAc3Bh2moQ8?g_st=aw","https://maps.app.goo.gl/f3oVp2Pa3BfjsKsTA","Berkat Mandiri Prima","PT.RASKA","PT SARI BERKAT ABADI"]

  const arrayCompanyName = ["Suri Nusantara Jaya Kosambi","Suri Nusantara Jaya Karawaci","E M S","CITRA SUMBER NUSANTARA","ARDHANA PERMATA ANUGERAH","Hijrahfood","ESTIKA TATA TIARA PUSAT","ESTIKA TATA TIARA TGR","Berkat Mandiri Prima","RASKA ANUGERAH UTAMA","PT SARI BERKAT ABADI"]
  const alldata = await db.collection("groupMessages").where("readIndia", "==", false).get();

    for (let i = 0; i < arrayCompanyId.length; i++) {
        const companyId = arrayCompanyId[i];
        const companyName = arrayCompanyName[i];
        console.log("Processing Company", companyName)
        await extractPrices(companyId, companyName,alldata)
    }
}




 async function allBacktoFalse() {
     const alldata = await db.collection("groupMessages").where("read", "==", true).get();

     const Promises =[]
     for (const doc of alldata.docs) {
     const id = doc.id
         Promises.push(db.collection("groupMessages").doc(id).update({read:false}))

     }

     await Promise.all(Promises)
     console.log("done")
     }

async function findMaxMin(currentDate) {
  const date = new Date(currentDate);

  // Calculate start of the day (midnight in local time)
  const startOfDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  // Add 24 hours and subtract 1 millisecond
  const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1);

  console.log(startOfDay.getTime());
  console.log(endOfDay.getTime());

  const querySnapshot = await db
    .collection('pricesData')
    .where('Timestamp', '>=', startOfDay.getTime())
    .get();
console.log(querySnapshot.docs.length)
  const priceData = [];

  querySnapshot.forEach((doc) => {
    priceData.push({
      type: doc.data().MeatType,
      brand: doc.data().Brands,
      price: doc.data().Prices,
      distributor: doc.data().Company
    });
  });

  // Group data by type-brand combination
  const groupedData = {};

  priceData.forEach(item => {
    const key = `${item.type}-${item.brand}`;

    if (!groupedData[key]) {
      groupedData[key] = [];
    }

    groupedData[key].push(item);
  });

  // Process each group to find min and max
  const results = [];

  Object.keys(groupedData).forEach(key => {
    const items = groupedData[key];
    const type = items[0].type;
    const brand = items[0].brand;

    // Find min and max across all distributors
    let minItem = items[0];
    let maxItem = items[0];

    items.forEach(item => {
      if (item.price < minItem.price) {
        minItem = item;
      }
      if (item.price > maxItem.price) {
        maxItem = item;
      }
    });

    // Create result object
    const resultItem = {
      type,
      brand
    };

    // Check if min and max are from the same distributor
    if (minItem.distributor === maxItem.distributor) {
      // If same distributor, set min to null and keep max
      resultItem.min = null;
      resultItem.max = { price: maxItem.price, distributor: maxItem.distributor };
    } else {
      // Different distributors, keep both min and max
      resultItem.min = { price: minItem.price, distributor: minItem.distributor };
      resultItem.max = { price: maxItem.price, distributor: maxItem.distributor };
    }

    // Add to results array
    results.push(resultItem);
  });

    // Store results in Firestore
  const batchWrites = [];


  for (const result of results) {
    // Create a document ID that combines date, type, and brand for uniqueness
    const docId = `${startOfDay}-${result.type}-${result.brand}`.replace(/\s+/g, "_");

    let minPrice = 0;
    let maxPrice = 0;
    let distributorMin =""
    let distributorMax =""

    if(result.min!==null){
      minPrice = result.min.price
      distributorMin = result.min.distributor
    }
    if (result.max.price!==null){
      maxPrice = result.max.price
      distributorMax = result.max.distributor
    }
    const writeDb = db.collection("minmaxPrices").doc(docId).set({
       meatType: result.type,
  brand: result.brand,
  date: startOfDay,
  maxPrice: maxPrice,
  minPrice: minPrice,
  distributorMin: distributorMin,
  distributorMax: distributorMax,
  createdAt: new Date()
    })


    batchWrites.push(writeDb)
  }

 await Promise.all(batchWrites);
  console.log("total results", results.length)
  return results;
}

async function findMinMaxPricesByMeatType(dateStr = null) {
  // Initialize Firebase


  // Parse date or use current date
  let targetDate;
  if (dateStr) {
    targetDate = new Date(dateStr);
  } else {
    targetDate = new Date();
  }

  // Reset to start of day
  targetDate.setHours(0, 0, 0, 0);

  // Calculate day boundaries in milliseconds
  const startOfDay = targetDate.getTime();
  const endOfDay = new Date(targetDate).setHours(23, 59, 59, 999);

  try {
    // Query Firestore for the day's data
    const snapshot = await db.collection('pricesData')
      .where('Timestamp', '>=', startOfDay)

      .get();

    if (snapshot.empty) {
        console.log("no data")
      return {};
    }

    // Convert snapshot to array
    const priceData = []


    snapshot.forEach((doc) => {
    priceData.push({
      MeatType: doc.data().MeatType,
      brand: doc.data().Brands,
      price: doc.data().Prices,
      distributor: doc.data().Company
    });
  });

  // Group data by type-brand combination
  const groupedData = {};

  priceData.forEach(item => {
    const key = `${item.MeatType}-${item.brand}`;

    if (!groupedData[key]) {
      groupedData[key] = [];
    }

    groupedData[key].push(item);
  });

  // Process each group to find min and max
  const results = [];

  Object.keys(groupedData).forEach(key => {
    const items = groupedData[key];
    const MeatType = items[0].MeatType;
    const brand = items[0].brand;

    // Find min and max across all distributors
    let minItem = items[0];
    let maxItem = items[0];

    items.forEach(item => {
      if (item.price < minItem.price) {
        minItem = item;
      }
      if (item.price > maxItem.price) {
        maxItem = item;
      }
    });

    // Create result object
    const resultItem = {
      MeatType,
      brand
    };

    // Check if min and max are from the same distributor
    if (minItem.distributor === maxItem.distributor) {
      // If same distributor, set min to null and keep max
      resultItem.min = null;
      resultItem.max = { price: maxItem.price, distributor: maxItem.distributor };
    } else {
      // Different distributors, keep both min and max
      resultItem.min = { price: minItem.price, distributor: minItem.distributor };
      resultItem.max = { price: maxItem.price, distributor: maxItem.distributor };
    }

    // Add to results array
    results.push(resultItem);

  });

  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  }
}

async function getGroupMmessages(currentDate){
  const date =  new Date(currentDate)
    const startOfDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  console.log(startOfDay)
  // Add 24 hours and subtract 1 millisecond
  const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1);
  console.log(startOfDay.getTime())
  console.log(endOfDay.getTime())
  const snapshot = await db.collection('pricesData').where("Timestamp", ">=",startOfDay.getTime()).where("Timestamp", "<=",endOfDay.getTime()).get();

  console.log(snapshot.docs.length)
}

async function setFalse(startDate) {
  const date = new Date(startDate)

  const startOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
  );

  startOfDay.setHours(0, 0, 0, 0);
  const snapshow = await db.collection("groupMessages").where("timestamp", ">=", startOfDay.getTime()).get();

  for (let i = 0; i < snapshow.docs.length; i++) {
    const id = snapshow.docs[i].id
    await db.collection("groupMessages").doc(id).update({
      readIndia: false,
      readAustralia: false,
      readUsa: false,
      readBrazil: false,
    })
  }
  console.log("Done updated " + snapshow.docs.length + " messages")

}



async function getPricesData(startDate) {
    const date = new Date(startDate)
    const startOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    console.log(startOfDay)
    // Add 24 hours and subtract 1 millisecond
    const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1);
    console.log(startOfDay.getTime())
    console.log(endOfDay.getTime())

  const result = await db.collection("pricesData").where("Timestamp", ">=", startOfDay.getTime()).where("Timestamp", "<=", endOfDay.getTime()).get();
console.log("Total data :", result.docs.length)

}

async function deletePricesData(startDate) {
  const date = new Date(startDate)
  const startOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
  )
  const result = await db.collection("pricesData").where("Timestamp", ">=", startOfDay.getTime()).get();
  for (let i = 0; i < result.docs.length; i++) {
    const id = result.docs[i].id
    await db.collection("pricesData").doc(id).delete()
  }
  console.log("Done deleted " + result.docs.length + " messages")
}


async function findAndStoreMaxMin( db,today) {


console.log("running find and store max min function at:", today);
const { startOfDay, endOfDay } = getStartAndEndOfDay(today);

console.log("start of day:", startOfDay);
console.log("end of day:", endOfDay);

const startOfDayJakarta=startOfDay
const endOfDayJakarta=endOfDay

  console.log("start of day Jakarta:", startOfDayJakarta);
console.log("end of day Jakarta:", endOfDayJakarta);

  const querySnapshot = await db.collection("pricesData").where("Timestamp", ">=", startOfDayJakarta).where("Timestamp", "<=", endOfDayJakarta).get();
  console.log(querySnapshot.docs.length);
  const priceData = [];

  querySnapshot.forEach((doc) => {
    priceData.push({
      type: doc.data().MeatType,
      brand: doc.data().Brands,
      price: doc.data().Prices,
      distributor: doc.data().Company
    });
  });

  // Group data by type-brand combination
  const groupedData = {};

  priceData.forEach(item => {
    const key = `${item.type}-${item.brand}`;

    if (!groupedData[key]) {
      groupedData[key] = [];
    }

    groupedData[key].push(item);
  });

  // Process each group to find min and max
  const results = [];

  Object.keys(groupedData).forEach(key => {
    const items = groupedData[key];
    const type = items[0].type;
    const brand = items[0].brand;

    // Find min and max across all distributors
    let minItem = items[0];
    let maxItem = items[0];

    items.forEach(item => {
      if (item.price < minItem.price) {
        minItem = item;
      }
      if (item.price > maxItem.price) {
        maxItem = item;
      }
    });

    // Create result object
    const resultItem = {
      type,
      brand,
      date: startOfDay, // Use start of day as the timestamp
    };

    // Check if min and max are from the same distributor
    if (minItem.distributor === maxItem.distributor) {
      // If same distributor, set min to null and keep max
      resultItem.min = null;
      resultItem.max = { price: maxItem.price, distributor: maxItem.distributor };
    } else {
      // Different distributors, keep both min and max
      resultItem.min = { price: minItem.price, distributor: minItem.distributor };
      resultItem.max = { price: maxItem.price, distributor: maxItem.distributor };
    }

    // Add to results array
    results.push(resultItem);
  });

  // Store results in Firestore
  const batchWrites = [];


  for (const result of results) {
    // Create a document ID that combines date, type, and brand for uniqueness
    const docId = `${startOfDay}-${result.type}-${result.brand}`.replace(/\s+/g, "_");

    let minPrice = 0;
    let maxPrice = 0;
    let distributorMin =""
    let distributorMax =""

    if(result.min!==null){
      minPrice = result.min.price
      distributorMin = result.min.distributor
    }
    if (result.max.price!==null){
      maxPrice = result.max.price
      distributorMax = result.max.distributor
    }
    const writeDb = db.collection("minmaxPrices").doc(docId).set({
       meatType: result.type,
  brand: result.brand,
  date: startOfDay,
  maxPrice: maxPrice,
  minPrice: minPrice,
  distributorMin: distributorMin,
  distributorMax: distributorMax,
  createdAt: new Date()
    })


    batchWrites.push(writeDb)
  }

 await Promise.all(batchWrites);

  return results;
}
function getStartAndEndOfDay(inputDay) {
  // Use the provided inputDay
  const jakartaTimeZone = "Asia/Jakarta";
  const startOfDay = new Date(inputDay.toLocaleString("en-US", { timeZone: jakartaTimeZone }));
  startOfDay.setHours(0, 0, 0, 0);
 const endOfDay = new Date(inputDay.toLocaleString("en-US", { timeZone: jakartaTimeZone }));
  endOfDay.setHours(23, 59, 59, 999);



  return { startOfDay:startOfDay.getTime(), endOfDay:endOfDay.getTime() };
}

async function saveCompanyData() {
  const arrayCompanyName = ["Suri Nusantara Jaya Kosambi","Suri Nusantara Jaya Karawaci","E M S","CITRA SUMBER NUSANTARA","ARDHANA PERMATA ANUGERAH","Hijrahfood","ESTIKA TATA TIARA PUSAT","ESTIKA TATA TIARA TGR","Berkat Mandiri Prima","RASKA ANUGERAH UTAMA"]

  const Promises = []
  for (let i = 0; i < arrayCompanyName.length; i++) {
    console.log(i)
    console.log(arrayCompanyName[i])
    Promises.push(db.collection("companies").doc(i.toString()).set({
      companyName: arrayCompanyName[i]
    }))
  }
  await Promise.all(Promises)
console.log("done")
}

async function getMinMaxlatestDate(today,country){
    const arrayCompanyName = ["Suri Nusantara Jaya Kosambi","Suri Nusantara Jaya Karawaci","E M S","CITRA SUMBER NUSANTARA","ARDHANA PERMATA ANUGERAH","Hijrahfood","ESTIKA TATA TIARA PUSAT","ESTIKA TATA TIARA TGR","Berkat Mandiri Prima","RASKA ANUGERAH UTAMA","PT SARI BERKAT ABADI"]

  const priceData=[]
  const dateToday = new Date(today)
const todayLastMillisecond = (60*60*1000*24)-1


for (let i = 0; i < arrayCompanyName.length; i++) {
  const company = arrayCompanyName[i]

  const latestDate = await db.collection("pricesData")
      .where("Company", "==", company).where("Country", "==", "India")
      .where("Timestamp","<=",dateToday.getTime()+todayLastMillisecond)
      .where("Country","==",country)
      .orderBy("Timestamp", "desc").limit(1).get()

   if (latestDate.empty) continue;

  console.log("latest Date for company: " + company + " is " + new Date(latestDate.docs[0].data().Timestamp) )


 const timeStampCompany = latestDate.docs[0].data().Timestamp

  const companyData = await db.collection("pricesData").where("Company", "==", company)
      .where("Timestamp","==",timeStampCompany).get()

  companyData.docs.forEach(doc => {
    priceData.push({
      brand:doc.data().Brands,
      distributor:doc.data().Company,
      MeatType:doc.data().MeatType,
      price:doc.data().Prices,
    })
  })

}

  const groupedData = {};

  priceData.forEach(item => {
    const key = `${item.MeatType}-${item.brand}`;

    if (!groupedData[key]) {
      groupedData[key] = [];
    }

    groupedData[key].push(item);
  });

  // Process each group to find min and max
  const results = [];

  Object.keys(groupedData).forEach(key => {
    const items = groupedData[key];
    const MeatType = items[0].MeatType;
    const brand = items[0].brand;

    // Find min and max across all distributors
    let minItem = items[0];
    let maxItem = items[0];

    items.forEach(item => {
      if (item.price < minItem.price) {
        minItem = item;
      }
      if (item.price > maxItem.price) {
        maxItem = item;
      }
    });

    // Create result object
    const resultItem = {
      MeatType,
      brand
    };

    // Check if min and max are from the same distributor
    if (minItem.distributor === maxItem.distributor) {
      // If same distributor, set min to null and keep max
      resultItem.min = null;
      resultItem.max = { price: maxItem.price, distributor: maxItem.distributor };
    } else {
      // Different distributors, keep both min and max
      resultItem.min = { price: minItem.price, distributor: minItem.distributor };
      resultItem.max = { price: maxItem.price, distributor: maxItem.distributor };
    }

    // Add to results array
    results.push(resultItem);

  });
  await fs.writeFileSync("./results.json", JSON.stringify(results));

  const batchWrites=[]

  const startOfDay = new Date(
      dateToday.getFullYear(),
      dateToday.getMonth(),
      dateToday.getDate()
    ).getTime();

  for (const result of results) {
    // Create a document ID that combines date, type, and brand for uniqueness
    const docId = `${startOfDay}-${result.type}-${result.brand}`.replace(/\s+/g, "_");

    let minPrice = 0;
    let maxPrice = 0;
    let distributorMin =""
    let distributorMax =""

    if(result.min!==null){
      minPrice = result.min.price
      distributorMin = result.min.distributor
    }
    if (result.max.price!==null){
      maxPrice = result.max.price
      distributorMax = result.max.distributor
    }
    const data = {
      meatType: result.MeatType,
  brand: result.brand,
  date: startOfDay,
  maxPrice: maxPrice,
  minPrice: minPrice,
	country: country,
  distributorMin: distributorMin,
  distributorMax: distributorMax,
  createdAt: new Date()
    }

    const writeDb = db.collection("minmaxPrices").doc(docId).set(data)



    batchWrites.push(writeDb)
  }

 await Promise.all (batchWrites);


  console.log("done");


}


async function cleanMinMaxData(tgl){
  const dateToday = new Date(tgl)

   const startOfDay = new Date(
      dateToday.getFullYear(),
      dateToday.getMonth(),
      dateToday.getDate()
    ).getTime();

  const data = await db.collection("minmaxPrices")
      .where("date","==",startOfDay).get()

  if (!data.empty){
     const batchDelete=[]

    data.forEach(item => {
      const deleteData = db.collection("minmaxPrices").doc(item.id).delete()
      batchDelete.push(deleteData)
    })

    await Promise.all(batchDelete)
    console.log("done delete data for ", dateToday)

}
  }


  const epochlast =1754703904898

async function deleteLastEpoch (epoch){
    const deleteData = await db.collection ("groupMessages").where("timestamp",">",epoch).get()
    const batchDelete=[]
    console.log("total data",deleteData.docs.length)
    deleteData.forEach(item => {
      const deleteData = db.collection("groupMessages").doc(item.id).delete()
      batchDelete.push(deleteData)
    })
    await Promise.all(batchDelete)
    console.log("done delete data of",batchDelete.length)

}

